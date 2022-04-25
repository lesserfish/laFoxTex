const {mathjax} = require('mathjax-full/js/mathjax.js');
const {TeX} = require('mathjax-full/js/input/tex.js');
const {SVG} = require('mathjax-full/js/output/svg.js');
const {liteAdaptor} = require('mathjax-full/js/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler} = require('mathjax-full/js/handlers/html.js');
const sharp = require("sharp")

const {AllPackages} = require('mathjax-full/js/input/tex/AllPackages.js');
const { hide } = require('yargs');

//
//  Minimal CSS needed for stand-alone image
//
const CSS = [
  'svg a{fill:blue;stroke:blue}',
  '[data-mml-node="merror"]>g{fill:red;stroke:red}',
  '[data-mml-node="merror"]>rect[data-background]{fill:yellow;stroke:none}',
  '[data-frame],[data-line]{stroke-width:70px;fill:none}',
  '.mjx-dashed{stroke-dasharray:140}',
  '.mjx-dotted{stroke-linecap:round;stroke-dasharray:0,140}',
  'use[data-c]{stroke-width:3px}'
].join('');

//
//  Get the command-line arguments
//

const adaptor = liteAdaptor();
const handler = RegisterHTMLHandler(adaptor);

//
//  Create input and output jax and a document using them on the content from the HTML file
//
const tex = new TeX({packages: AllPackages.sort().join(', ').split(/\s*,\s*/)});
const svg = new SVG({fontCache: 'local'});
const html = mathjax.document('', {InputJax: tex, OutputJax: svg});

var TexToSVG = function(texsrc, options){

    const node = html.convert(texsrc, {
        display: !options.inline,
        em: options.em,
        ex: options.ex,
        containerWidth: options.width
    });
    
    var ihtml = adaptor.innerHTML(node);
    var out = ihtml.replace(/<defs>/, `<defs><style>${CSS}</style>`);

    return out;
}
var SVGToPng = async function(svg, options) {
    var img = sharp(Buffer.from(svg));
    
    options.resizeWidth = (options.resizeWidth == undefined) ? null : options.resizeWidth;
    options.resizeHeight = (options.resizeHeight == undefined) ? null : options.resizeHeight;
    options.resize = (options.resize == undefined) ? null : options.resize;
    
    if(options.resize){
        var newWidth = (await img.metadata()).width * options.resize
        img = img.resize(newWidth);
    }
    else if(options.resizeWidth || options.resizeHeight){
        img = img.resize(options.resizeWidth, options.resizeHeight);
    }
    var png = await img.png()
    return png.toBuffer()
}

module.exports = {TexToSVG, SVGToPng}