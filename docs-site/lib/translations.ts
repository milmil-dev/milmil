import { uiTranslations } from 'fumadocs-ui/i18n';
import { openapiTranslations } from 'fumadocs-openapi/i18n';
import { i18n } from './i18n';

/** Traditional Chinese UI strings, shared by zh-TW and zh-HK. */
const traditional = {
  'Ask AI(AI chat button)': '問 AI',
  'Back to Home(404 not found page)': '返回首頁',
  'Choose a language(language switcher)': '選擇語言',
  'Choose a language(language switcher)(aria-label)': '選擇語言',
  'Close Banner(banner)(aria-label)': '關閉橫幅',
  'Close Search(search dialog)(aria-label)': '關閉搜索',
  'Close Sidebar(aria-label)': '關閉側邊欄',
  'Close Sidebar(sidebar)(aria-label)': '關閉側邊欄',
  'Collapse Sidebar(sidebar)(aria-label)': '摺疊側邊欄',
  'Copied Text(code block)(aria-label)': '已複製',
  'Copy Anchor Link(heading anchor)(aria-label)': '複製錨點鏈接',
  'Copy Link(accordion)(aria-label)': '複製鏈接',
  'Copy Markdown(page actions)': '複製 Markdown',
  'Copy Text(code block)(aria-label)': '複製',
  'Dark(theme switcher)(aria-label)': '深色',
  'Default(type table)': '默認值',
  'Edit on GitHub(edit page)': '在 GitHub 上編輯',
  'Hide Sidebar(sidebar)': '隱藏側邊欄',
  'Last updated on(page footer)': '最後更新於',
  'Layout Tab(layout tab trigger)': '佈局標籤',
  'Light(theme switcher)(aria-label)': '淺色',
  'Next Page(pagination)': '下一頁',
  'No Headings(table of contents)': '無標題',
  'No results found(search dialog)': '未找到結果',
  'On this page(table of contents)': '本頁內容',
  'Open Search(search trigger)(aria-label)': '打開搜索',
  'Open Sidebar(aria-label)': '打開側邊欄',
  'Open Sidebar(sidebar)(aria-label)': '打開側邊欄',
  'Open in ChatGPT(page actions)': '在 ChatGPT 中打開',
  'Open in Claude(page actions)': '在 Claude 中打開',
  'Open in Cursor(page actions)': '在 Cursor 中打開',
  'Open in GitHub(page actions)': '在 GitHub 中打開',
  'Open in Scira AI(page actions)': '在 Scira AI 中打開',
  'Open(page actions)': '打開',
  'Page Not Found(404 not found page)': '頁面未找到',
  'Parameters(type table)': '參數',
  'Previous Page(pagination)': '上一頁',
  'Prop(type table)': '屬性',
  'Read {url}, I want to ask questions about it.(page actions)':
    '閱讀 {url}，我想就此提問。',
  'Returns(type table)': '返回值',
  'Search(search dialog)': '搜索文檔',
  'Search(search trigger)': '搜索文檔',
  'Show Sidebar(sidebar)': '顯示側邊欄',
  'System(theme switcher)(aria-label)': '跟隨系統',
  'Table of Contents(inline table of contents)': '目錄',
  'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 not found page)':
    '您訪問的頁面可能已被移除、更名，或暫時不可用。',
  'Toggle Menu(home layout header)(aria-label)': '切換菜單',
  'Toggle Theme(theme switcher)(aria-label)': '切換主題',
  'Type(type table)': '類型',
  'View as Markdown(page actions)': '以 Markdown 查看',
};

/** Simplified Chinese UI strings. */
const simplified = {
  'Ask AI(AI chat button)': '问 AI',
  'Back to Home(404 not found page)': '返回首页',
  'Choose a language(language switcher)': '选择语言',
  'Choose a language(language switcher)(aria-label)': '选择语言',
  'Close Banner(banner)(aria-label)': '关闭横幅',
  'Close Search(search dialog)(aria-label)': '关闭搜索',
  'Close Sidebar(aria-label)': '关闭侧边栏',
  'Close Sidebar(sidebar)(aria-label)': '关闭侧边栏',
  'Collapse Sidebar(sidebar)(aria-label)': '折叠侧边栏',
  'Copied Text(code block)(aria-label)': '已复制',
  'Copy Anchor Link(heading anchor)(aria-label)': '复制锚点链接',
  'Copy Link(accordion)(aria-label)': '复制链接',
  'Copy Markdown(page actions)': '复制 Markdown',
  'Copy Text(code block)(aria-label)': '复制',
  'Dark(theme switcher)(aria-label)': '深色',
  'Default(type table)': '默认值',
  'Edit on GitHub(edit page)': '在 GitHub 上编辑',
  'Hide Sidebar(sidebar)': '隐藏侧边栏',
  'Last updated on(page footer)': '最后更新于',
  'Layout Tab(layout tab trigger)': '布局标签',
  'Light(theme switcher)(aria-label)': '浅色',
  'Next Page(pagination)': '下一页',
  'No Headings(table of contents)': '无标题',
  'No results found(search dialog)': '未找到结果',
  'On this page(table of contents)': '本页内容',
  'Open Search(search trigger)(aria-label)': '打开搜索',
  'Open Sidebar(aria-label)': '打开侧边栏',
  'Open Sidebar(sidebar)(aria-label)': '打开侧边栏',
  'Open in ChatGPT(page actions)': '在 ChatGPT 中打开',
  'Open in Claude(page actions)': '在 Claude 中打开',
  'Open in Cursor(page actions)': '在 Cursor 中打开',
  'Open in GitHub(page actions)': '在 GitHub 中打开',
  'Open in Scira AI(page actions)': '在 Scira AI 中打开',
  'Open(page actions)': '打开',
  'Page Not Found(404 not found page)': '页面未找到',
  'Parameters(type table)': '参数',
  'Previous Page(pagination)': '上一页',
  'Prop(type table)': '属性',
  'Read {url}, I want to ask questions about it.(page actions)':
    '阅读 {url}，我想就此提问。',
  'Returns(type table)': '返回值',
  'Search(search dialog)': '搜索文档',
  'Search(search trigger)': '搜索文档',
  'Show Sidebar(sidebar)': '显示侧边栏',
  'System(theme switcher)(aria-label)': '跟随系统',
  'Table of Contents(inline table of contents)': '目录',
  'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 not found page)':
    '您访问的页面可能已被移除、更名，或暂时不可用。',
  'Toggle Menu(home layout header)(aria-label)': '切换菜单',
  'Toggle Theme(theme switcher)(aria-label)': '切换主题',
  'Type(type table)': '类型',
  'View as Markdown(page actions)': '以 Markdown 查看',
};

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  // Chrome for the generated API pages (request/response tabs, playground buttons).
  // Untranslated keys fall back to English, same as the rest of the site.
  .extend(openapiTranslations())
  .add({
    en: {
      displayName: 'English',
    },
    'zh-CN': {
      displayName: '简体中文',
      ...simplified,
    },
    'zh-TW': {
      displayName: '繁體中文',
      ...traditional,
    },
    'zh-HK': {
      displayName: '粵語',
      ...traditional,
    },
  });
