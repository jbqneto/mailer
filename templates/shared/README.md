# Shared email templates

Templates in this directory are reusable building blocks shared by multiple projects.

## BaseEmail

`base-email.tsx` provides the common email structure:

- Header
- Main content (`main`)
- Footer

Each content slot accepts a `ReactNode`, so callers can compose email-safe React Email components and regular React elements. The content is rendered through `react-email`; raw HTML strings are not injected into the document.

Project templates can use the default header/footer or provide their own React nodes.

The shared layer must remain presentation-oriented. Project-specific business rules,
payload schemas and subjects belong to the project template that consumes it.
