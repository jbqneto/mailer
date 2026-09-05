import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function usage(): never {
  console.error('Usage: npm run email:new -- <template-name> --project <project-name>');
  process.exit(1);
}

const args = process.argv.slice(2);
const name = args[0];
const projectFlagIndex = args.indexOf('--project');
const project = projectFlagIndex >= 0 ? args[projectFlagIndex + 1] : undefined;

if (!name || !project || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project)) usage();

const directory = join(process.cwd(), 'templates', project);
const file = join(directory, `${name}.tsx`);
if (existsSync(file)) {
  console.error(`Template already exists: ${file}`);
  process.exit(1);
}

const componentName = `${toPascalCase(name)}Email`;
const source = `import { EmailHeading, EmailLayout, EmailText } from '../shared/components.js';

export interface ${componentName}Props {
  // Add the fields expected in the request JSON.
}

export default function ${componentName}(_props: ${componentName}Props) {
  return (
    <EmailLayout preview="Replace with the email preview text.">
      <EmailHeading>Replace with the email title</EmailHeading>
      <EmailText>Replace with the email content.</EmailText>
    </EmailLayout>
  );
}
`;

mkdirSync(directory, { recursive: true });
writeFileSync(file, source, 'utf8');
console.log(`Created ${file}`);
console.log('Next: add the component, Zod schema, subject and preview data to the template registry/catalog.');

function toPascalCase(value: string): string {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
