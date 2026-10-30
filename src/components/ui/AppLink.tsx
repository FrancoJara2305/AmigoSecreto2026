import type { ComponentProps } from 'react';
import { Link as RouterLink } from 'react-router';

// Explicit sequential focus also includes links in WebKit's restricted tab mode.
// Zero preserves DOM order; callers can still opt out with an explicit tabIndex.
export function AppLink(props:ComponentProps<typeof RouterLink>){
  return <RouterLink tabIndex={0} {...props}/>;
}
