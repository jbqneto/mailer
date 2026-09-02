import { describe, expect, it } from 'vitest';
import { render } from 'react-email';
import BaseEmail from './base-email.js';

function Header() {
  return <div>PROJECT HEADER</div>;
}

function Footer() {
  return <div>PROJECT FOOTER</div>;
}

describe('BaseEmail', () => {
  it('renders header, main content and footer', async () => {
    const html = await render(
      <BaseEmail
        preview="Preview text"
        header={<Header />}
        main={<div>MAIN CONTENT</div>}
        footer={<Footer />}
      />,
    );

    expect(html).toContain('PROJECT HEADER');
    expect(html).toContain('MAIN CONTENT');
    expect(html).toContain('PROJECT FOOTER');
    expect(html).toContain('Preview text');
  });

  it('renders the default header and footer', async () => {
    const html = await render(
      <BaseEmail preview="Preview text" main={<div>MAIN CONTENT</div>} />,
    );

    expect(html).toContain('MAILER');
    expect(html).toContain('MAIN CONTENT');
    expect(html).toContain('Este é um e-mail automático.');
  });
});
