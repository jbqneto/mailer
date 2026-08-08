import dotenv from 'dotenv';

dotenv.config({
  path: process.env.ENV_FILE ?? '.env',
});
import { loadProjects } from '../config/projects.js';
import { SmtpEmailProvider } from '../infrastructure/smtp/smtp-email-provider.js';

const projects = loadProjects();
const provider = new SmtpEmailProvider();

let failed = false;

for (const project of projects) {
  process.stdout.write(`Verifying SMTP for ${project.id}... `);

  try {
    await provider.verify(project);
    console.log('OK');
  } catch (error) {
    failed = true;
    console.log('FAILED');

    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    } else {
      console.error('  Unknown SMTP verification error');
    }
  }
}

if (failed) {
  process.exitCode = 1;
}
