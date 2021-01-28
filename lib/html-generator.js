/**
 * marked-it
 *
 * Copyright (c) 2014, 2017 IBM Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class HtmlGeneratorMarkdownIt {
  #markdownIt;
  #tocBuilders;
  #footnoteDefRegex = /^<p>(\[\^([^\]\s]+)]:\s*)/;

  constructor() {
    const hljs = require('highlight.js');
    this.markdownIt = require('markdown-it')({
      html: true,
      linkify: true,
      highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(lang, str).value;
          } catch (__) { }
        }
        return ''; // use external default escaping
      }
    }).use(require('markdown-it-attrs'), {
      leftDelimiter: '{:',
      rightDelimiter: '}',
      allowedAttributes: []  // empty array = all attributes are allowed
    }).use(require('markdown-it-footnote'))
      .use(require('markdown-it-deflist'))
      .use(require('markdown-it-multimd-table'), {
        multiline: true,
        rowspan: false,
        headerless: false
      });
  }

  setTocBuilders(tocBuilders) {
    const common = require("./common");

    this.markdownIt.core.ruler.push('anchor', state => {
      const length = state.tokens.length;
      for (let i = 0; i < length; i++) {
        if (state.tokens[i].type == 'heading_open'
          && state.tokens[i + 1].type == 'inline'
          && state.tokens[i + 2].type == 'heading_close') {
            const html = this.markdownIt.renderer.render([
            state.tokens[i],
            state.tokens[i + 1],
            state.tokens[i + 2]
          ]);
          const dom = common.htmlToDom(html);
          let text = common.domUtils.getText(dom);
          // remove footnote references from title so that they don't show
          // up in generated TOCs
          text = text.replace(new RegExp(this.footnoteRefRegex, "g"), "");
          tocBuilders.forEach(function (current) {
            current.heading(text, state.tokens[i].tag.substring(1), html);
          });
        }
      }
    });
  }

  generate(text, tocBuilders) {
    this.setTocBuilders(tocBuilders);
    text = this.convertAttributes(text);
    text = this.fixIdentation(text);

    // generate!
    let generated = this.markdownIt.render(text);

    /* 
     * post-processing: escape single-quotes just to be consistent with the old
     * way to make comparison easier
     */
    generated = generated.replace(/'/g, '&#39;');

    return {
      html: {
        text: generated
      }
    };
  }

  convertAttributes(text) {
    /*
     * Attribute list definitions are not supported, so process them manually.
     * Start by building a key->value table, and remove the definitions from
     * string.
     */
    let attributeListDefinitions = {};
    const REGEX_ALD = /{:(\w+):\s+([^}\n]+)}[^\n]*\n/g;
    text = text.replace(REGEX_ALD, function (match, p1, p2) {
      attributeListDefinitions[p1] = p2
      return "";
    });

    /* Now text-replace these throughout the string */
    Object.keys(attributeListDefinitions).forEach(function (key) {
      const regex = new RegExp(`({:[^}\\n]*)\\b${key}\\b([^}\\n]*})`, 'g');
      text = text.replace(regex, (match, p1, p2) => {
        return `${p1}${attributeListDefinitions[key]}${p2}`;
      });
    });

    /*
     * The attributes plugin wants header attributes to be on the same line as
     * the header, so detect cases where they're not (at least close to all of
     * them) and adjust.
     */
    const REGEX_HEADER_ATTRIBUTE = /([\n|^]#+\s[^\n]+)\n({:[^}]+}[^\n]*\n)/;
    let match = REGEX_HEADER_ATTRIBUTE.exec(text);
    while (match) {
      /* 
       * Intentionally done iteratively rather than a single text.replace() 
       * invocation with a global regex in order to support multiple lines of
       * attributes per header.
       */
      text = text.replace(match[0], `${match[1]} ${match[2]}`);
      match = REGEX_HEADER_ATTRIBUTE.exec(text);
    }

    /*
     * The attributes plugin seems to only handle the first set of attributes
     * on a given line.
     * If multiple attribute sets are detected then merge them.
     */
    text = text.replace(/}\s*{:/g, " ");

    /*
     * The attributes plugin seems to only recognize attributes on a table if
     * there's a line of whitespace between them. Try to detect this and insert
     * a whitespace line.
     */
    text = text.replace(/(\|[^\n]*\n)({:)/g, (match, p1, p2) => {
      return `${p1}\n${p2}`;
    });

    /*
     * The attributes plugin expects quoted values to use double-quotes.
     */
    const regex = /{:[^}\n]+}/g;
    match = regex.exec(text);
    while (match) {
      const replacement = match[0].replace(/'/g, '"');
      if (replacement !== match[0]) {
        text = text.replace(match[0], replacement);
      }
      match = regex.exec(text);
    }

    return text;
  }

  fixIdentation(text) {
    /*
     * For containment, using two spaces of indentation is not spec'd to be
     * adequate.  Marked and markdown-it each honor 2-spaces of indentation in
     * different contexts from each other. Detect the 2-spaces case and bump
     * these indentations to four spaces to remove any ambiguity.
     */
    return text.replace(/\n  (\S)/g, function (match, p1) {
      return `\n    ${p1}`;
    });
  }
}

module.exports = new HtmlGeneratorMarkdownIt();
