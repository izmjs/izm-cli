#!/usr/bin/env node

/* eslint-disable no-console */

const inquirer = require('inquirer');
const { exists, writeFile } = require('fs');
const { spawn } = require('child_process');
const { resolve } = require('path');
const { platform } = require('os');
const { promisify } = require('util');
const { blue, yellow } = require('chalk');
const ora = require('ora');

const spinner = ora('Installing NPM dependencies');

const quotes = require('./data');

const exists$ = promisify(exists);
const writeFile$ = promisify(writeFile);

const npmCmd = platform().startsWith('win') ? 'npm.cmd' : 'npm';

const REPO_DOMAIN = 'github.com';
const IZM_DEVTOOLS_REPO = 'izmjs/izmjs.git';
const IZM_REPO = 'izmjs/izmjs.git';

const getRepoUrl = (repo, isGit = true) => {
  return isGit === true ? `git@${REPO_DOMAIN}:${repo}` : `https://${REPO_DOMAIN}/${repo}`;
};

const spawn$ = (...args) =>
  new Promise((fnResolve, fnReject) => {
    const cmd = spawn(...args);
    cmd.on('close', fnResolve);
    cmd.on('error', fnReject);
  });

exports.randomQuote = () => {
  const random = Math.floor(Math.random() * quotes.length);
  const { quote, author } = quotes[random];

  return `${blue(quote)}
- ${yellow(author)}
`;
};

inquirer
  .prompt([
    {
      message: 'Choose a name',
      name: 'name',
      default: 'starter',
      validate: async name => {
        if (!name) {
          throw new Error('The name should not be empty');
        }

        if (!/[0-9a-zA-Z]+/.test(name)) {
          throw new Error(`"${name}" is an invalid name. Please do not use special characters`);
        }

        const isExists = await exists$(resolve(name));

        if (isExists) {
          throw new Error(`"${name}" already exists. Please choose an other name`);
        }

        return true;
      },
    },
    {
      message: 'Add "devtools" functional module?',
      name: 'devtools',
      type: 'confirm',
      default: true,
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
  .then(async ({ name, devtools, npm, ssh, port }) => {
    // Save credentials
    await spawn$('git', ['config', 'credential.helper', 'store']);

    // Clone the boilerplate
    await spawn$('git', ['clone', getRepoUrl(IZM_REPO, ssh), name], {
      stdio: 'inherit',
    });

    // Create env files
    await writeFile$(resolve(name, '.env', '.common.env'), `PORT=${port}`);
    await writeFile$(
      resolve(name, '.env', '.development.env'),
      `NODE_ENV=development
DEBUG=modules:*,config:*,boilerplate:*

# general
APP_TITLE=${name}
APP_DESCRIPTION=Generated with izm CLI
`,
    );

    // Clone the devtools functional module
    if (devtools) {
      await spawn$('git', ['clone', getRepoUrl(IZM_DEVTOOLS_REPO, ssh), 'devtools'], {
        cwd: resolve(name, 'modules'),
        stdio: 'inherit',
      });
    }

    // Install npm dependencies
    if (npm) {
      spinner.start();

      const interval = setInterval(() => {
        spinner.text = exports.randomQuote();
      }, 10000);

      try {
        await spawn$(npmCmd, ['install'], {
          cwd: resolve(name),
          stdio: 'ignore',
        });
      } catch (e) {
        // Do nothing, proceed
      }

      clearInterval(interval);
      spinner.stop();
    }
  });
