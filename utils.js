function transformYouTubeLink(link) {
  if (!link) return '';

  if (link.includes('youtu.be/')) {
    try {
      const url = new URL(link);
      const videoId = url.pathname.replace('/', '');
      return `https://www.youtube.com/embed/${videoId}`;
    } catch (e) {
      return link;
    }
  }

  if (link.includes('youtube.com/watch')) {
    try {
      const url = new URL(link);
      const videoId = url.searchParams.get('v');
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }
    } catch (e) {
      return link;
    }
  }

  return link;
}

module.exports = { transformYouTubeLink };
