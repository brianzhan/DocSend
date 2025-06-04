class PDFDocument {
  constructor(options = {}) {
    this.options = options;
    this.images = [];
    this.stream = null;
  }

  openImage(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    return img;
  }

  addPage({size = [800, 600]} = {}) {
    this.images.push({size, data: null});
  }

  image(img, x = 0, y = 0) {
    const entry = this.images[this.images.length - 1];
    if (entry) {
      entry.data = img.src;
      entry.width = img.width || entry.size[0];
      entry.height = img.height || entry.size[1];
    }
  }

  pipe(stream) {
    this.stream = stream;
    return stream;
  }

  end() {
    const blob = this._createPdfFromImages(this.images);
    if (this.stream && typeof this.stream.finish === 'function') {
      this.stream.finish(blob);
    }
  }

  _createPdfFromImages(images) {
    let pdf = '%PDF-1.3\n';
    const offsets = [0];

    function addObject(str) {
      offsets.push(pdf.length);
      pdf += str;
    }

    const pageKids = [];
    let objIndex = 1;
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const width = image.width || 800;
      const height = image.height || 600;
      const imageObjId = ++objIndex;
      const contentObjId = ++objIndex;
      const pageObjId = ++objIndex;

      const imgBinary = atob(image.data.split(',')[1] || '');
      const imgLength = imgBinary.length;
      addObject(`${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgLength} >>\nstream\n`);
      pdf += imgBinary + '\nendstream\nendobj\n';

      addObject(`${contentObjId} 0 obj\n<< /Length ${(\'q \' + width + ' 0 0 ' + height + ' 0 0 cm /Im' + i + ' Do Q').length} >>\nstream\nq ${width} 0 0 ${height} 0 0 cm /Im${i} Do Q\nendstream\nendobj\n`);

      addObject(`${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources <</XObject <</Im${i} ${imageObjId} 0 R>> >> /MediaBox [0 0 ${width} ${height}] /Contents ${contentObjId} 0 R >>\nendobj\n`);

      pageKids.push(`${pageObjId} 0 R`);
    }

    const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${images.length} >>\nendobj\n`;
    addObject(pagesObj);

    const catalogObj = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    addObject(catalogObj);

    const xrefStart = pdf.length;
    pdf += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i++) {
      pdf += ('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n';
    }

    pdf += 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

    return new Blob([pdf], { type: 'application/pdf' });
  }
}

if (typeof module !== 'undefined') module.exports = PDFDocument;
