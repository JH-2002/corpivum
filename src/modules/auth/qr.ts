import qrcode from 'qrcode-generator';

/**
 * QR code do TOTP gerado LOCALMENTE, no servidor, como SVG (ADR-0014). Nenhum serviço externo recebe o
 * segredo. `qrcode-generator` é JS puro, sem dependências e sem scripts de instalação.
 * O SVG é decorativo para leitores de tela: a alternativa acessível é a chave manual ao lado.
 */
export function totpQrSvg(uri: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(uri, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}
