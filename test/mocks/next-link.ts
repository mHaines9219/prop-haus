import { createElement, forwardRef, type AnchorHTMLAttributes, type ImgHTMLAttributes } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  prefetch?: boolean;
  scroll?: boolean;
  replace?: boolean;
  shallow?: boolean;
};

function hrefString(href: LinkProps['href']): string {
  if (typeof href === 'string') return href;
  const qs = href.query ? `?${new URLSearchParams(href.query)}` : '';
  return `${href.pathname ?? ''}${qs}`;
}

export function linkModule() {
  const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
    { href, prefetch: _p, scroll: _s, replace: _r, shallow: _sh, children, ...rest },
    ref,
  ) {
    return createElement('a', { ...rest, href: hrefString(href), ref }, children);
  });
  return { default: Link };
}

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number;
  sizes?: string;
};

export function imageModule() {
  function Image({ fill: _f, priority: _p, unoptimized: _u, quality: _q, ...rest }: ImageProps) {
    return createElement('img', rest);
  }
  return { default: Image };
}
