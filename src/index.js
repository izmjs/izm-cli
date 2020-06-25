#!/usr/bin/env node

/* eslint-disable no-console */

const inquirer = require('inquirer');
const { exists, writeFile } = require('fs');
const { spawn } = require('child_process');
const { resolve } = require('path');
const { platform } = require('os');
const { promisify } = require('util');
const { green } = require('chalk');
const path = require('path');

const MODULES = require('./modules');

const exists$ = promisify(exists);
const writeFile$ = promisify(writeFile);

const npmCmd = platform().startsWith('win') ? 'npm.cmd' : 'npm';

const REPO_DOMAIN = 'github.com';
const IZM_REPO = 'izmjs/izmjs.git';

const getRepoUrl = (repo, isGit = true) => {
  return isGit === true ? `git@${REPO_DOMAIN}:${repo}` : `https://${REPO_DOMAIN}/${repo}`;
};

const setEnvVars = ({ name }) => {
  return inquirer
    .prompt([
      {
        message: 'Username',
        name: 'username',
        default: 'username',
      },
      {
        message: 'Password',
        name: 'password',
        type: 'password',
        default: 'Azerty@1234',
      },
      {
        message: 'Email',
        name: 'email',
        default: `${name}@example.com`,
      },
      {
        message: 'Firstname',
        name: 'firstname',
        validate(value) {
          if (!value) {
            return 'The firstname should not be empty';
          }

          return true;
        },
      },
      {
        message: 'Lastname',
        name: 'lastname',
        validate(value) {
          if (!value) {
            return 'The lastname should not be empty';
          }

          return true;
        },
      },
    ])
    .then((data) => writeFile$(resolve(name, '.env', '.defaults.json'), JSON.stringify(data, null, '  ')));
};

const spawn$ = (...args) =>
  new Promise((fnResolve, fnReject) => {
    const cmd = spawn(...args);
    cmd.on('close', fnResolve);
    cmd.on('error', fnReject);
  });

// takes in a target dir and copies the contents of /assets into it
// be careful this returns a promise
const copyDir = (target) => {
  if (platform().startsWith('win')) {
    spawn$(
      'xcopy',
      [
        path.join(__dirname, '../assets'),
        path.join(__dirname, `../${target}`),
        '/S',
        '/q' /* /q flag for quiet mode on windows */,
      ],
      {
        stdio: 'inherit',
      },
    );
  } else {
    spawn$('cp', ['-r', './assets/public', target], {
      stdio: 'inherit',
    });
  }
};

inquirer
  .prompt([
    {
      message: 'Choose a name',
      name: 'name',
      default: 'starter',
      async validate(name) {
        if (!name) {
          return 'The name should not be empty';
        }

        if (!/^[0-9a-zA-Z]+$/.test(name)) {
          return `"${name}" is an invalid name. Please do not use special characters`;
        }

        const isExists = await exists$(resolve(name));

        if (isExists) {
          return `"${name}" already exists. Please choose another name`;
        }

        return true;
      },
    },
    {
      message: 'Choose modules to add',
      name: 'modules',
      type: 'checkbox',
      choices: MODULES.map((one) => ({ name: one.name, value: one, checked: true })),
    },
    {
      message: 'Install dependencies?',
      name: 'npm',
      type: 'confirm',
      default: true,
    },
    {
      message: 'Use "ssh" instead of "https" to clone',
      name: 'ssh',
      type: 'confirm',
      default: false,
    },
    {
      message: 'Application PORT',
      name: 'port',
      type: 'number',
      default: 3000,
    },
  ])
  .then(async ({ name, modules, npm, ssh, port }) => {
    // Save credentials
    await spawn$('git', ['config', 'credential.helper', 'store']);

    // Clone the boilerplate
    await spawn$('git', ['clone', getRepoUrl(IZM_REPO, ssh), name], {
      stdio: 'inherit',
    });

    // Creates the public starter files
    await copyDir(name);

    // Create env files
    await writeFile$(resolve(name, '.env', '.common.env'), 'NODE_ENV=development');
    await writeFile$(
      resolve(name, '.env', '.development.env'),
      `PORT=${port}
DEBUG=modules:*,config:*,boilerplate:*,app:*

# general
APP_TITLE=${name}
APP_DESCRIPTION=Generated with izm CLI
`,
    );

    // Clone functional module
    for (let i = 0; i < modules.length; i += 1) {
      const { type, data, folder } = modules[i];
      switch (type) {
        case 'git': {
          const { ssh: sshRepo, https: httpsRepo } = data;
          // eslint-disable-next-line
          await spawn$('git', ['clone', ssh && sshRepo ? sshRepo : httpsRepo, folder], {
            stdio: 'inherit',
            cwd: resolve(name, 'modules'),
          });
          break;
        }
        default:
          break;
      }
    }

    const { envVars } = await inquirer.prompt([
      {
        message: 'Set env variables',
        name: 'envVars',
        type: 'confirm',
        default: false,
      },
    ]);

    if (envVars) {
      await setEnvVars({ name });
    }

    // Install npm dependencies
    if (npm) {
      try {
        await spawn$(npmCmd, ['install'], {
          cwd: resolve(name),
          stdio: 'inherit',
        });
      } catch (e) {
        // Do nothing, proceed
      }
    }

    console.log(
      green(`
    Next steps:

    $ cd ${name}${npm ? '' : '\n$ npm install'}

    # Start MongoDB Server
    $ mongod --dbpath=db > logs/mongod.log 2>&1 &

    # Start the server
    $ npm start
`),
    );
  });
