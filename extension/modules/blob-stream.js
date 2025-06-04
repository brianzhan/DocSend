function blobStream() {
  const handlers = {};
  let blob = null;
  return {
    on(event, cb) {
      handlers[event] = cb;
    },
    finish(data) {
      blob = data;
      if (handlers['finish']) handlers['finish']();
    },
    toBlobURL(type = 'application/pdf') {
      if (!blob) return null;
      return URL.createObjectURL(blob);
    }
  };
}
if (typeof module !== 'undefined') module.exports = blobStream;
