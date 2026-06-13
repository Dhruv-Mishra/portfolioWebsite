import type { AnchorHTMLAttributes, ReactNode } from 'react';

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
}

export default function Link({ href, children, prefetch: _prefetch, replace: _replace, scroll: _scroll, shallow: _shallow, passHref: _passHref, legacyBehavior: _legacyBehavior, ...props }: LinkProps) {
  return <a href={href} {...props}>{children}</a>;
}