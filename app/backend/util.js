const fs = require('fs');
const { spawn, exec } = require('child_process');
const { set } = require('lodash');
const shell = require('shelljs');

const { taps, commands } = require('./constants');

const getKnots = () =>
  new Promise((resolve, reject) => {
    try {
      const knots = fs.readdirSync('./knots');

      resolve(knots);
    } catch (err) {
      reject(err);
    }
  });

const getTaps = () =>
  new Promise((resolve, reject) => {
    console.log('Called');
    if (taps) {
      resolve(taps);
    } else {
      reject();
    }
  });

const detectDocker = () =>
  new Promise((resolve, reject) => {
    // Run `docker -v` on the user's shell
    const docker = spawn('docker', ['-v']);

    // A version number was returned, docker is installed
    docker.stdout.on('data', (version) => {
      resolve(version.toString('utf8'));
    });

    // Threw error, no Docker
    docker.on('error', () => {
      reject();
    });
  });

const writeFile = (path, content) =>
  new Promise((resolve, reject) => {
    fs.writeFile(path, content, (err) => {
      if (!err) {
        resolve();
      }

      reject();
    });
  });

const getTapConfig = () =>
  new Promise((resolve) => {
    // Hard code for now
    resolve([
      { key: 'host', label: 'Hostname', required: true },
      { key: 'user', label: 'User name', required: true },
      { key: 'password', label: 'Password', required: true },
      { key: 'dbname', label: 'Database', required: true },
      { key: 'port', label: 'Port', required: true },
      { key: 'schema', label: 'Schema', required: false }
    ]);
  });

const readFile = (path) =>
  new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => {
      if (!err) {
        resolve(JSON.parse(data));
      }
      reject(err);
    });
  });

const addKnotAttribute = (attributeArray, value) =>
  new Promise((resolve, reject) => {
    console.log('This is the first layer');
    readFile('./knot.json')
      .then((knotObject) => {
        const newKnot = set(knotObject, attributeArray, value);

        writeFile('./knot.json', JSON.stringify(newKnot))
          .then(() => {
            resolve();
          })
          .catch(reject);
      })
      .catch(reject);
  });

const createKnot = (tapName, tapVersion) =>
  new Promise((resolve, reject) => {
    writeFile(
      './knot.json',
      JSON.stringify({
        tap: {
          name: tapName,
          version: tapVersion
        }
      })
    )
      .then(() => {
        getTapConfig(tapName)
          .then((config) => {
            addKnotAttribute(['tap', 'config'], config)
              .then(() => {
                resolve(config);
              })
              .catch(reject);
          })
          .catch(reject);
      })
      .catch(reject);
  });

const addTap = (tap, version) =>
  new Promise((resolve, reject) => {
    createKnot(tap, version)
      .then(resolve)
      .catch(reject);
  });

const writeConfig = (config) =>
  new Promise((resolve, reject) => {
    writeFile('./config.json', JSON.stringify(config))
      .then(() => {
        shell.rm('-rf', './docker/tap');
        shell.mkdir('-p', './docker/tap');
        shell.mv('./config.json', './docker/tap');
        exec(commands.runDiscovery, (error, stdout, stderr) => {
          if (error || stderr) {
            reject(error || stderr);
          }

          resolve();
        });
      })
      .catch(reject);
  });

const readSchema = () =>
  new Promise((resolve, reject) => {
    readFile('./docker/tap/catalog.json')
      .then(resolve)
      .catch(reject);
  });

const getSchema = (config) =>
  new Promise((resolve, reject) => {
    writeConfig(config)
      .then(() => {
        readSchema()
          .then(resolve)
          .catch(reject);
      })
      .catch(reject);
  });

const addSchema = (config) =>
  new Promise((resolve, reject) => {
    addKnotAttribute(['tap', 'config'], config)
      .then(() => {
        getSchema(config)
          .then(resolve)
          .catch(reject);
      })
      .catch((err) => {
        reject(err);
      });
  });

module.exports = {
  getKnots,
  getTaps,
  detectDocker,
  addTap,
  addSchema
};
