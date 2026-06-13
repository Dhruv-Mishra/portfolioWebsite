"use client";

import ProjectModal from '@/components/ProjectModal';
import { getProjectBySlug } from '@/lib/projects';
import type { ProjectSlug } from '@/lib/projectCatalog';

interface ChatProjectModalProps {
  projectSlug: ProjectSlug | null;
  onClose: () => void;
}

export default function ChatProjectModal({ projectSlug, onClose }: ChatProjectModalProps) {
  const project = projectSlug ? getProjectBySlug(projectSlug) : null;

  return <ProjectModal project={project} onClose={onClose} />;
}