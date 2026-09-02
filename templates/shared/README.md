# Shared email templates

Templates in this directory are reusable building blocks shared by multiple projects.

## BaseEmail

`base-email.tsx` provides the common email structure:

- Header
- Main content (`children`)
- Footer

Project templates can use the default header/footer or provide their own React nodes.

The shared layer must remain presentation-oriented. Project-specific business rules,
payload schemas and subjects belong to the project template that consumes it.
