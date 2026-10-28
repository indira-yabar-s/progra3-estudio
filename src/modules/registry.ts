import type { LucideIcon } from 'lucide-react';
import { BookOpen, GitFork, GraduationCap, Layers, Puzzle, Workflow } from 'lucide-react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { MessageKey } from '@/i18n';

/**
 * Registro de módulos del laboratorio. Cada fase agrega su módulo aquí:
 * la navegación, la página de inicio y el router se construyen a partir de esta lista.
 */
export interface LabModule {
  id: string;
  /** Primer segmento de la ruta: #/<path> */
  path: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  navKey?: MessageKey;
  icon: LucideIcon;
  phase: 1 | 2 | 3;
  component: LazyExoticComponent<ComponentType> | null;
}

export const MODULES: LabModule[] = [
  {
    id: 'verifier',
    path: 'verificador',
    titleKey: 'module.verifier.title',
    descKey: 'module.verifier.desc',
    navKey: 'nav.verifier',
    icon: Workflow,
    phase: 1,
    component: lazy(() => import('./verifier/VerifierPage')),
  },
  {
    id: 'learn',
    path: 'aprende',
    titleKey: 'module.learn.title',
    descKey: 'module.learn.desc',
    navKey: 'nav.learn',
    icon: BookOpen,
    phase: 1,
    component: lazy(() => import('./learn/LearnRoutes')),
  },
  {
    id: 'structures',
    path: 'estructuras',
    titleKey: 'module.structures.title',
    descKey: 'module.structures.desc',
    icon: Layers,
    phase: 2,
    component: null,
  },
  {
    id: 'graphs',
    path: 'grafos',
    titleKey: 'module.graphs.title',
    descKey: 'module.graphs.desc',
    icon: GitFork,
    phase: 2,
    component: null,
  },
  {
    id: 'exam',
    path: 'examen',
    titleKey: 'module.exam.title',
    descKey: 'module.exam.desc',
    icon: GraduationCap,
    phase: 3,
    component: null,
  },
  {
    id: 'patterns',
    path: 'patrones',
    titleKey: 'module.patterns.title',
    descKey: 'module.patterns.desc',
    icon: Puzzle,
    phase: 3,
    component: null,
  },
];

export const findModule = (path: string) => MODULES.find((m) => m.path === path && m.component);
