// Type definitions for Terminal commands
export interface CommandResult {
  output: React.ReactNode;
  action?: () => void;
}

export type CommandFunction = (args: string[]) => CommandResult | Promise<CommandResult>;

export type CommandRegistry = Record<string, CommandFunction>;

// Type for project data
export interface ProjectData {
  name: string;
  desc: React.ReactNode;
  lang: string;
  link: string;
  colorClass: string;
  image: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  imageClassName?: string;
}

// Type for social links
export interface SocialLink {
  name: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  url: string;
  color: string;
}

// Type for navigation links
export interface NavLink {
  name: string;
  href: string;
}

// Mouse position hook type
export interface MousePosition {
  x: number;
  y: number;
}

// Joke API response types
export interface JokeApiResponse {
  error?: boolean;
  type?: 'single' | 'twopart';
  joke?: string;
  setup?: string;
  delivery?: string;
}
