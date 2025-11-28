/**
 * Markdown to HTML Converter (Browser Version)
 * 浏览器端的 Markdown 转 HTML 转换器
 */

class MarkdownConverter {
  constructor() {
    // 默认配置
    this.defaultConfig = {
      breaks: false,
      emoji: true,
      highlight: true,
      highlightStyle: 'github',
      includeDefaultStyles: true,
      mermaidServer: 'https://unpkg.com/mermaid/dist/mermaid.min.js',
      plantumlServer: 'http://www.plantuml.com/plantuml',
      plantumlOpenMarker: '@startuml',
      plantumlCloseMarker: '@enduml',
      'markdown-it-include': {
        enable: false
      },
      // TOC 配置
      generateToc: true,
      tocDepth: 3,
      tocPosition: 'top' // 'top', 'bottom', 'none'
    };
  }

  /**
   * 主转换函数
   * @param {Object} options - 配置选项
   * @param {string} options.markdown - Markdown 文本内容
   * @param {string} [options.css] - 自定义 CSS 内容
   * @param {string} [options.title] - HTML 标题
   * @param {Object} [options.config] - markdown-pdf 配置
   * @returns {string} - 完整的 HTML 字符串
   */
  convert(options) {
    try {
      // 合并配置
      const config = Object.assign({}, this.defaultConfig, options.config || {});

      // 解析 Front Matter
      const matterParts = this.parseFrontMatter(options.markdown);

      // Front Matter 可以覆盖部分配置
      if (matterParts.data.generateToc !== undefined) {
        config.generateToc = matterParts.data.generateToc;
      }
      if (matterParts.data.tocDepth !== undefined) {
        config.tocDepth = matterParts.data.tocDepth;
      }
      if (matterParts.data.tocPosition !== undefined) {
        config.tocPosition = matterParts.data.tocPosition;
      }

      // 将 Markdown 转为 HTML 内容
      const htmlContent = this.convertMarkdownToHtml(matterParts, config);

      // 生成完整的 HTML 页面
      const fullHtml = this.makeHtml({
        title: options.title || 'Converted Document',
        content: htmlContent,
        css: options.css || '',
        config: config
      });

      return fullHtml;
    } catch (error) {
      console.error('转换失败:', error);
      throw error;
    }
  }

  /**
   * 解析 YAML Front Matter
   * 简化版本,只提取 --- 包围的内容
   */
  parseFrontMatter(text) {
    const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = text.match(frontMatterRegex);

    if (match) {
      // 简单解析 YAML (仅支持基本的 key: value 格式)
      const yamlText = match[1];
      const data = {};

      yamlText.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();

          // 简单类型转换
          if (value === 'true') data[key] = true;
          else if (value === 'false') data[key] = false;
          else if (/^\d+$/.test(value)) data[key] = parseInt(value, 10);
          else data[key] = value;
        }
      });

      return {
        data: data,
        content: match[2]
      };
    }

    return {
      data: {},
      content: text
    };
  }

  /**
   * 将 Markdown 转换为 HTML 内容
   */
  convertMarkdownToHtml(matterParts, config) {
    // 检查 markdown-it 是否已加载
    if (typeof window.markdownit === 'undefined') {
      throw new Error('markdown-it 库未加载,请在 HTML 中引入 markdown-it');
    }

    // 配置 markdown-it
    const breaks = this.getBooleanValue(matterParts.data.breaks, config.breaks);

    const md = window.markdownit({
      html: true,
      breaks: breaks,
      highlight: (str, lang) => {
        // Mermaid 特殊处理
        if (lang && lang.match(/\bmermaid\b/i)) {
          return `<div class="mermaid">${str}</div>`;
        }

        // 语法高亮
        if (config.highlight && window.hljs && lang && window.hljs.getLanguage(lang)) {
          try {
            return '<pre class="hljs"><code><div>' +
                   window.hljs.highlight(str, { language: lang }).value +
                   '</div></code></pre>';
          } catch (error) {
            console.error('语法高亮失败:', error);
          }
        }

        // 默认处理
        return '<pre class="hljs"><code><div>' + this.escapeHtml(str) + '</div></code></pre>';
      }
    });

    // 图片路径处理 - 浏览器端保持相对路径
    const defaultRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const srcIndex = token.attrIndex('src');
      let href = token.attrs[srcIndex][1];

      // 解码 URL 并清理引号
      href = decodeURIComponent(href).replace(/("|')/g, '');
      token.attrs[srcIndex][1] = href;

      return defaultRender(tokens, idx, options, env, self);
    };

    // 添加插件
    this.loadMarkdownItPlugins(md, config, matterParts);

    // 渲染
    return md.render(matterParts.content);
  }

  /**
   * 加载 markdown-it 插件
   */
  loadMarkdownItPlugins(md, config, matterParts) {
    // checkbox 插件
    if (window.markdownitCheckbox) {
      md.use(window.markdownitCheckbox);
    }

    // emoji 插件
    const emojiEnabled = this.getBooleanValue(matterParts.data.emoji, config.emoji);
    if (emojiEnabled && window.markdownitEmoji) {
      md.use(window.markdownitEmoji);
    }

    // container 插件
    if (window.markdownitContainer) {
      md.use(window.markdownitContainer, '', {
        validate: (name) => name.trim().length,
        render: (tokens, idx) => {
          if (tokens[idx].info.trim() !== '') {
            return `<div class="${tokens[idx].info.trim()}">\n`;
          } else {
            return `</div>\n`;
          }
        }
      });
    }

    // PlantUML 插件
    if (window.markdownitPlantuml) {
      const plantumlOptions = {
        openMarker: matterParts.data.plantumlOpenMarker || config.plantumlOpenMarker,
        closeMarker: matterParts.data.plantumlCloseMarker || config.plantumlCloseMarker,
        server: config.plantumlServer
      };
      md.use(window.markdownitPlantuml, plantumlOptions);
    }
  }

  /**
   * 生成完整的 HTML 页面
   */
  makeHtml(options) {
    const { title, content, css, config } = options;

    // 处理 TOC
    let processedContent = content;
    let tocHtml = '';

    // 从配置中获取 TOC 设置(Front Matter 可覆盖)
    const generateToc = config.generateToc !== false;
    const tocDepth = config.tocDepth || 3;
    const tocPosition = config.tocPosition || 'top';

    if (generateToc && tocPosition !== 'none') {
      // 首先为所有标题添加 ID
      processedContent = this.addHeadingIds(processedContent, 6);

      // 提取标题
      const headings = this.extractHeadings(processedContent, tocDepth);

      // 生成 TOC HTML
      if (headings.length > 0) {
        tocHtml = this.generateTocHtml(headings);

        // 根据位置插入 TOC
        if (tocPosition === 'top') {
          processedContent = tocHtml + '\n' + processedContent;
        } else if (tocPosition === 'bottom') {
          processedContent = processedContent + '\n' + tocHtml;
        }
      }
    } else if (generateToc && tocPosition === 'none') {
      // 即使不显示 TOC,也为标题添加 ID(用于锚点跳转)
      processedContent = this.addHeadingIds(processedContent, 6);
    }

    // 构建样式
    let styles = '';

    // 默认样式
    if (config.includeDefaultStyles) {
      styles += this.getDefaultStyles();
    }

    // TOC 样式
    if (generateToc && tocPosition !== 'none') {
      styles += this.getTocStyles();
    }

    // 语法高亮样式
    if (config.highlight) {
      styles += this.getHighlightStyles(config.highlightStyle);
    }

    // 自定义 CSS
    if (css) {
      styles += `\n<style>\n${css}\n</style>\n`;
    }

    // Mermaid 脚本
    let mermaidScript = '';
    if (config.mermaidServer) {
      mermaidScript = `
    <script src="${config.mermaidServer}"></script>
    <script>
      mermaid.initialize({
        startOnLoad: true,
        theme: document.body.classList.contains('vscode-dark') ||
               document.body.classList.contains('vscode-high-contrast')
          ? 'dark'
          : 'default'
      });
    </script>`;
    }

    // 生成完整 HTML
    return `<!DOCTYPE html>
<html>
<head>
<title>${this.escapeHtml(title)}</title>
<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
${styles}
${mermaidScript}
</head>
<body>
${processedContent}
</body>
</html>`;
  }

  /**
   * 获取默认样式
   */
  getDefaultStyles() {
    // 这里可以内联默认的 CSS 样式
    // 为了简化,先返回基本的样式引用标记
    return `<style id="default-markdown-styles">
/* 基础 Markdown 样式 */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, 'Ubuntu', 'Droid Sans', sans-serif;
  font-size: 14px;
  line-height: 1.6;
  padding: 0 26px;
  word-wrap: break-word;
}

body > *:first-child {
  margin-top: 0 !important;
}

body > *:last-child {
  margin-bottom: 0 !important;
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 16px;
  line-height: 1.25;
}

h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1em; }
h5 { font-size: 0.875em; }
h6 { font-size: 0.85em; color: #6a737d; }

code {
  font-family: 'Courier New', Courier, monospace;
  background-color: rgba(27,31,35,0.05);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-size: 85%;
}

pre {
  background-color: #f6f8fa;
  border-radius: 3px;
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
}

pre code {
  background-color: transparent;
  padding: 0;
}

blockquote {
  margin: 0;
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
}

table {
  border-collapse: collapse;
  width: 100%;
  overflow: auto;
}

table th, table td {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}

table tr {
  background-color: #fff;
  border-top: 1px solid #c6cbd1;
}

table tr:nth-child(2n) {
  background-color: #f6f8fa;
}

img {
  max-width: 100%;
  box-sizing: content-box;
}

.emoji {
  height: 1.4em;
  width: 1.4em;
  display: inline-block;
  vertical-align: text-top;
}

/* 分页符 */
.page {
  page-break-after: always;
}
</style>`;
  }

  /**
   * 获取 TOC 样式
   */
  getTocStyles() {
    return `<style id="toc-styles">
/* 目录容器 */
.table-of-contents {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 20px 25px;
  margin: 25px 0 30px 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

/* 目录标题 */
.toc-title {
  font-size: 1.4em;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 15px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #3498db;
}

/* 目录列表 */
.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  line-height: 1.8;
}

.toc-sublist {
  list-style: none;
  margin: 5px 0;
  padding-left: 20px;
}

/* 目录项 */
.toc-item {
  margin: 5px 0;
  position: relative;
}

/* 目录链接 */
.toc-link {
  color: #34495e;
  text-decoration: none;
  display: inline-block;
  padding: 3px 0;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
  padding-left: 8px;
  margin-left: -8px;
}

.toc-link:hover {
  color: #3498db;
  border-left-color: #3498db;
  padding-left: 12px;
}

/* 不同级别的样式 */
.toc-level-1 > .toc-link {
  font-weight: 600;
  font-size: 1.05em;
  color: #2c3e50;
}

.toc-level-2 > .toc-link {
  font-weight: 500;
  color: #34495e;
}

.toc-level-3 > .toc-link {
  font-weight: 400;
  color: #5a6c7d;
  font-size: 0.95em;
}

.toc-level-4 > .toc-link,
.toc-level-5 > .toc-link,
.toc-level-6 > .toc-link {
  font-weight: 400;
  color: #6c757d;
  font-size: 0.9em;
}

/* 打印样式 */
@media print {
  .table-of-contents {
    background-color: white;
    border: 1px solid #333;
    box-shadow: none;
    page-break-after: always;
    margin-bottom: 0;
  }

  .toc-title {
    color: #000;
    border-bottom-color: #333;
  }

  .toc-link {
    color: #000;
  }

  .toc-link:after {
    content: leader('.') target-counter(attr(href), page);
  }

  /* 隐藏打印时的链接下划线 */
  a[href^="#"] {
    text-decoration: none;
  }
}

/* 滚动行为优化 */
html {
  scroll-behavior: smooth;
}

/* 标题锚点偏移(避免被固定头部遮挡) */
h1[id], h2[id], h3[id], h4[id], h5[id], h6[id] {
  scroll-margin-top: 20px;
}
</style>`;
  }

  /**
   * 获取语法高亮样式
   */
  getHighlightStyles(styleName) {
    // 从 CDN 加载 highlight.js 样式
    const style = styleName || 'github';
    return `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${style}.min.css">`;
  }

  /**
   * HTML 转义
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 布尔值处理
   */
  getBooleanValue(a, b) {
    if (a === false) {
      return false;
    } else {
      return a !== undefined ? a : b;
    }
  }

  /**
   * 从 HTML 中提取标题生成目录
   * @param {string} html - HTML 内容
   * @param {number} maxDepth - 最大深度(1-6)
   * @returns {Array} 标题列表
   */
  extractHeadings(html, maxDepth = 3) {
    const headings = [];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // 查找所有标题元素
    for (let level = 1; level <= Math.min(maxDepth, 6); level++) {
      const elements = tempDiv.querySelectorAll(`h${level}`);
      elements.forEach(el => {
        // 确保标题有 ID
        if (!el.id) {
          // 生成 ID:移除特殊字符,转换为小写
          const text = el.textContent || '';
          el.id = this.generateHeadingId(text);
        }

        headings.push({
          level: level,
          text: el.textContent || '',
          id: el.id,
          element: el
        });
      });
    }

    // 按在文档中的顺序排序
    headings.sort((a, b) => {
      const posA = Array.from(tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6')).indexOf(a.element);
      const posB = Array.from(tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6')).indexOf(b.element);
      return posA - posB;
    });

    return headings;
  }

  /**
   * 生成标题 ID
   * @param {string} text - 标题文本
   * @returns {string} ID
   */
  generateHeadingId(text) {
    // 移除特殊字符,保留中文、字母、数字
    let id = text
      .trim()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    // 确保 ID 不为空
    if (!id) {
      id = 'heading-' + Math.random().toString(36).substr(2, 9);
    }

    return id;
  }

  /**
   * 生成目录 HTML
   * @param {Array} headings - 标题列表
   * @returns {string} TOC HTML
   */
  generateTocHtml(headings) {
    if (!headings || headings.length === 0) {
      return '';
    }

    let html = '<div class="table-of-contents">\n';
    html += '  <h2 class="toc-title">目录</h2>\n';
    html += '  <ul class="toc-list">\n';

    let lastLevel = 0;
    let openLists = 0;

    headings.forEach((heading, index) => {
      const { level, text, id } = heading;

      // 处理层级变化
      if (level > lastLevel) {
        // 增加层级
        for (let i = lastLevel; i < level - 1; i++) {
          html += '    <ul class="toc-sublist">\n';
          openLists++;
        }
      } else if (level < lastLevel) {
        // 减少层级
        for (let i = level; i < lastLevel; i++) {
          html += '    </ul>\n';
          openLists--;
        }
        html += '  </li>\n';
      } else if (index > 0) {
        // 同级,关闭上一个项
        html += '  </li>\n';
      }

      // 添加目录项
      html += `  <li class="toc-item toc-level-${level}">\n`;
      html += `    <a href="#${id}" class="toc-link">${this.escapeHtml(text)}</a>\n`;

      lastLevel = level;
    });

    // 关闭所有打开的列表
    html += '  </li>\n';
    while (openLists > 0) {
      html += '    </ul>\n';
      openLists--;
    }

    html += '  </ul>\n';
    html += '</div>\n';

    return html;
  }

  /**
   * 在 HTML 中插入 ID 到标题
   * @param {string} html - 原始 HTML
   * @param {number} maxDepth - 最大深度
   * @returns {string} 处理后的 HTML
   */
  addHeadingIds(html, maxDepth = 6) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    for (let level = 1; level <= maxDepth; level++) {
      const headings = tempDiv.querySelectorAll(`h${level}`);
      headings.forEach(heading => {
        if (!heading.id) {
          heading.id = this.generateHeadingId(heading.textContent || '');
        }
      });
    }

    return tempDiv.innerHTML;
  }
}

// 导出为全局变量(浏览器端)
if (typeof window !== 'undefined') {
  window.MarkdownConverter = MarkdownConverter;
}
