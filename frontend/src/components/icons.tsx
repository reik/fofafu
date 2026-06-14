import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const baseProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function HomeIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 10v9h11v-9" />
      <path d="M9.5 19v-5h5v5" />
    </svg>
  );
}

export function FamilyIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 10.5 12 5l7 5.5" />
      <path d="M7 10v9h10v-9" />
      <path d="M12 16s-3-1.9-3.7-4a1.9 1.9 0 0 1 3.2-1.8l.5.5.5-.5a1.9 1.9 0 0 1 3.2 1.8c-.7 2.1-3.7 4-3.7 4Z" />
    </svg>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 6.5h14a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z" />
      <path d="M8 11h8" />
      <path d="M8 14h5" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function CommunityIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m15 9-2 5-5 2 2-5 5-2Z" />
      <path d="M12 12h.01" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14 8 3 3" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

export function OpenIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
      <path d="M5 5v14h14" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m4 12 16-7-5 14-3-6-8-1Z" />
      <path d="m12 13 8-8" />
    </svg>
  );
}

export function ImagePlusIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="m7 16 3.5-3.5 2.5 2.5 2-2 2 3" />
      <path d="M16.5 8v4" />
      <path d="M14.5 10h4" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m5 12 4 4 10-10" />
    </svg>
  );
}

export function ThumbsUpIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M7 11v9H4v-9h3Z" />
      <path d="M7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17 20H7" />
    </svg>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 20s-7-4.4-8.7-9A4.2 4.2 0 0 1 11 7.6l1 1.1 1-1.1A4.2 4.2 0 0 1 20.7 11C19 15.6 12 20 12 20Z" />
    </svg>
  );
}

export function HugIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 18c1.5-3.2 4-5 7-5s5.5 1.8 7 5" />
      <path d="M7 13 4 16" />
      <path d="m17 13 3 3" />
    </svg>
  );
}

export function CelebrateIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m5 19 4-12 8 8-12 4Z" />
      <path d="M14 5h.01" />
      <path d="M19 4h.01" />
      <path d="M19 10h.01" />
      <path d="m15 9 3-3" />
    </svg>
  );
}

export function SupportIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M7 12.5 12 18l5-5.5" />
      <path d="M4.5 10a3.5 3.5 0 0 1 6-2.5L12 9l1.5-1.5a3.5 3.5 0 0 1 6 2.5c0 4-7.5 9-7.5 9s-7.5-5-7.5-9Z" />
    </svg>
  );
}
