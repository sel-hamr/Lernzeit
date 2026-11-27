import { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { springs, timings } from './springs'

/*
 * Layout animations for short lists that are not virtualised (goal rows, docs, questions, a sheet's
 * options): a row that comes or goes fades, and the rows around it slide to their new place on the
 * app's snappy spring. Reanimated leaves them out when the phone's "remove animations" is on.
 *
 * Wrap a list in `<LayoutAnimationConfig skipEntering>` so rows that are there when the page opens
 * do not fade in again (the page's own FadeInUp brings them in).
 */

/** A row arriving. */
export const listEnter = FadeIn.duration(timings.fade.duration)
/** A row leaving. */
export const listExit = FadeOut.duration(timings.fadeOut.duration)
/** The rows around it moving. */
export const listLayout = LinearTransition.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness).mass(springs.snappy.mass)
