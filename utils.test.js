const { transformYouTubeLink } = require('./utils');

test('transforms youtu.be links', () => {
  const input = 'https://youtu.be/4L5Ckz6KndE';
  const expected = 'https://www.youtube.com/embed/4L5Ckz6KndE';
  expect(transformYouTubeLink(input)).toBe(expected);
});

test('transforms youtube.com/watch links', () => {
  const input = 'https://www.youtube.com/watch?v=4L5Ckz6KndE';
  const expected = 'https://www.youtube.com/embed/4L5Ckz6KndE';
  expect(transformYouTubeLink(input)).toBe(expected);
});

test('returns original link when not a YouTube link', () => {
  const input = 'https://example.com';
  expect(transformYouTubeLink(input)).toBe(input);
});

test('returns empty string for falsy input', () => {
  expect(transformYouTubeLink('')).toBe('');
});
