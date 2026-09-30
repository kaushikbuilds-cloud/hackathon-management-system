import { Composition } from "remotion";
import { Intro, INTRO_FRAMES } from "./Intro";

export const Root = () => (
  <>
    {/* Phones (Android app). */}
    <Composition id="Intro" component={Intro} durationInFrames={INTRO_FRAMES} fps={30} width={720} height={1280} />
    {/* Computers (Windows app). */}
    <Composition id="IntroWide" component={Intro} durationInFrames={INTRO_FRAMES} fps={30} width={1280} height={720} />
  </>
);
