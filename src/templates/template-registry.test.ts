import { describe, expect, it } from 'vitest';
import {
  compileTemplate,
  InvalidTemplateSubjectError,
  templateRegistry,
} from './template-registry.js';
import { listTemplatePreviews } from './template-preview-data.js';

describe('template registry', () => {
  it.each(listTemplatePreviews())('renders %s as HTML and plain text', async (preview) => {
    const result = await compileTemplate(preview.name, preview.data);

    expect(result.subject).toBeTruthy();
    expect(result.subject).not.toMatch(/[\r\n]/);
    expect(result.html).toMatch(/^<!DOCTYPE html/);
    expect(result.text).toBeTruthy();
    expect(result.text).not.toContain('<html');
  });

  it.each(Object.keys(templateRegistry))('rejects empty data for %s', async (template) => {
    await expect(compileTemplate(template, {})).rejects.toThrow();
  });

  it('rejects line breaks generated in a subject', async () => {
    await expect(compileTemplate('generic-notification', {
      title: 'Hello\r\nBcc: attacker@example.com',
      message: 'World',
    })).rejects.toBeInstanceOf(InvalidTemplateSubjectError);
  });
});
