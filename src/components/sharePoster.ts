// 分享/导出图片的品牌海报包装：把汇总卡片套进带品牌页眉与来源页脚（二维码 + 生成时间）的海报里再截图
const SITE_URL = 'https://colflip.github.io/carpay/';
const SITE_HOST = 'colflip.github.io/carpay';

const logoSvg = (size: number, dark: boolean): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="${
    dark ? '#f4f4f5' : '#18181b'
  }"/><text x="32" y="42" text-anchor="middle" font-size="33" font-weight="700" font-family="system-ui, -apple-system, 'PingFang SC', sans-serif" fill="${
    dark ? '#18181b' : '#ffffff'
  }">¥</text><rect x="17" y="47" width="30" height="4.5" rx="2.25" fill="#10b981"/></svg>`;

// lucide github 图标（stroke currentColor，随水印文字颜色）
const githubSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>';

export async function renderPosterPng(
  card: HTMLElement | null,
  opts: { dark: boolean; title: string },
): Promise<string | null> {
  if (!card) return null;
  const [{ toPng }, { default: QRCode }] = await Promise.all([
    import('html-to-image'),
    import('qrcode'),
  ]);

  const width = Math.min(card.offsetWidth, 480);
  const dark = opts.dark;
  const bg = dark ? '#18181b' : '#ffffff';
  const muted = dark ? 'text-zinc-500' : 'text-zinc-400';
  const time = new Date().toLocaleString('zh-CN', { hour12: false });

  // 外层容器负责把海报移出视口；待截图的海报节点本身保持 static，
  // 否则 fixed 负偏移会随样式带入截图、把内容画到画布外
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;';
  const poster = document.createElement('div');
  poster.style.cssText = `width:${width + 28}px;padding:14px;background:${bg};`;
  stage.appendChild(poster);
  poster.innerHTML = `
    <div class="flex items-center justify-between gap-3 pb-3">
      <div class="flex min-w-0 items-center gap-2">
        ${logoSvg(22, dark)}
        <span class="shrink-0 text-[15px] font-semibold tracking-tight ${
          dark ? 'text-zinc-100' : 'text-zinc-900'
        }">CarPay</span>
        <span class="truncate text-[13px] ${dark ? 'text-zinc-400' : 'text-zinc-500'}">用车全周期成本计算</span>
      </div>
      <span class="shrink-0 rounded-full border px-2 py-0.5 text-[13px] leading-4 ${
        dark ? 'border-zinc-700 text-zinc-400' : 'border-zinc-200 text-zinc-500'
      }">${opts.title}</span>
    </div>`;

  const clone = card.cloneNode(true) as HTMLElement;
  // 页面上的说明气泡在静态图里没有意义；仓库水印页面已不显示，只在导出图里注入到免责声明行
  clone.querySelectorAll('button[aria-label^="说明："]').forEach((n) => n.remove());
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  const disclaimer = Array.from(clone.querySelectorAll('p')).find((p) => p.textContent?.includes('本测算'));
  if (disclaimer) {
    const mark = document.createElement('a');
    mark.href = 'https://github.com/colflip/carpay';
    mark.target = '_blank';
    mark.rel = 'noreferrer';
    mark.setAttribute('aria-label', 'colflip/CarPay GitHub 仓库');
    mark.className = dark ? 'text-zinc-600' : 'text-zinc-300';
    // 定位与字号用内联样式：Tailwind 只编译页面源码里出现过的类，裸 top-[75%] 等不在产物中
    mark.style.cssText =
      'position:absolute;right:0;top:75%;transform:translateY(-50%);display:flex;align-items:center;gap:6px;font-size:13px;line-height:1.4;';
    mark.innerHTML = `${githubSvg}<span>colflip/CarPay</span>`;
    disclaimer.prepend(mark);
  }
  poster.appendChild(clone);

  const qr = await QRCode.toDataURL(SITE_URL, {
    margin: 0,
    width: 144,
    color: { dark: '#18181b', light: '#ffffff' },
  });
  const footer = document.createElement('div');
  footer.className = `mt-3 flex items-start justify-between gap-4 border-t pt-3 ${
    dark ? 'border-zinc-800' : 'border-zinc-100'
  }`;
  footer.innerHTML = `
    <div class="min-w-0 space-y-1">
      <div class="text-[13px] font-medium leading-4 ${dark ? 'text-zinc-300' : 'text-zinc-600'}">来源 · CarPay 纯前端离线计算</div>
      <div class="text-[13px] leading-4 ${muted}">生成时间：${time}</div>
      <div class="truncate text-[13px] leading-4 ${muted}">${SITE_HOST}</div>
    </div>
    <div class="flex shrink-0 flex-col items-center gap-1">
      <img src="${qr}" width="72" height="72" alt="" class="rounded-lg border bg-white p-1 ${
        dark ? 'border-zinc-700' : 'border-zinc-200'
      }" />
      <span class="text-[11px] leading-3 ${muted}">扫码打开</span>
    </div>`;
  poster.appendChild(footer);

  document.body.appendChild(stage);
  try {
    return await toPng(poster, { pixelRatio: 2, backgroundColor: bg });
  } finally {
    stage.remove();
  }
}
