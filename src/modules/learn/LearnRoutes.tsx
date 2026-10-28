import { useRoute } from '@/lib/router';
import { ExamPage } from './pages/ExamPage';
import { FailedPage } from './pages/FailedPage';
import { LearnHome } from './pages/LearnHome';
import { LessonPage } from './pages/LessonPage';
import { ReviewPage } from './pages/ReviewPage';

/**
 * Rutas del módulo:
 *   #/aprende                       inicio y temario
 *   #/aprende/repasar               preguntas falladas
 *   #/aprende/<tema>/repaso         hoja de repaso imprimible
 *   #/aprende/<tema>/simulacro      simulacro con nota sobre 20
 *   #/aprende/<tema>/<lección>      lección
 */
export default function LearnRoutes() {
  const [, a, b] = useRoute().segments;
  if (!a) return <LearnHome />;
  if (a === 'repasar') return <FailedPage />;
  if (b === 'repaso') return <ReviewPage topicId={a} />;
  if (b === 'simulacro') return <ExamPage topicId={a} />;
  if (b) return <LessonPage topicId={a} lessonId={b} />;
  return <LearnHome />;
}
