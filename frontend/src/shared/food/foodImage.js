/// Shrinks a picked photo to at most `maxSize` px on its longer side and
/// returns it as a JPEG data URL, so food pictures stay small enough to load
/// quickly on a bus. The server uploads the data URL and stores the address.
export const compressFoodImage = (file, maxSize = 800) =>
  new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Choose an image file'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not read the image'));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        // JPEG has no transparency; a white base keeps PNG cut-outs clean.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
