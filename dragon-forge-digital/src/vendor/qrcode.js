// QR Code Generator for JavaScript by Kazuhiko Arase (MIT), with its UTF-8 helper
// so names with accents encode correctly. Bundled to site/assets/js/vendor/qrcode.js.
import qrcode from 'qrcode-generator';
import { stringToBytes } from '../../node_modules/qrcode-generator/dist/qrcode_UTF8.mjs';

qrcode.stringToBytes = stringToBytes;
export default qrcode;
