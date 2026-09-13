const { exec } = require("node:child_process");

function formatCommandOutput(stdout, stderr) {
  const output = [stdout, stderr]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!output) {
    return "No output.";
  }

  if (output.length <= 1500) {
    return output;
  }

  return `${output.slice(0, 1497)}...`;
}

function runUpdateCommand(command) {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024,
        timeout: 5 * 60 * 1000,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject({
            error,
            stderr,
            stdout,
          });
          return;
        }

        resolve({
          stderr,
          stdout,
        });
      },
    );
  });
}

module.exports = {
  formatCommandOutput,
  runUpdateCommand,
};
