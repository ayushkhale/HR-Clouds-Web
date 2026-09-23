import iPad from "../../../assets/iPad.png";
import { Reveal, useParallax } from "../../../shared/motion";

/* The hero product shot on the homepage.

   Motion: the frame settles forward as it enters, then drifts slowly against
   the scroll. Parallax and the entrance transform live on separate nodes so
   neither overwrites the other — a running transform on the same node would
   silently discard the other one. */
function Dashboard() {
  const parallax = useParallax(30);

  return (
    <section className="relative z-0">
      <div className="bottom-0 -z-10 absolute bg-primary-500 w-full h-1/2" />
      <div className="justify-items-center grid m-auto px-4 sm:px-8 md:px-16 xl:px-24 py-8 md:py-16 max-w-[90rem]">
        <Reveal variant="scale" duration={900} className="w-full max-w-5xl">
          <div
            ref={parallax}
            style={{ transform: "translate3d(0, var(--parallax-y, 0px), 0)" }}
          >
            {/* Intrinsic dimensions are declared so the browser reserves the
                right box before the file arrives and the section below never
                jumps. The image is decorative-adjacent but does carry meaning
                here, so it keeps a real alt. */}
            <img
              src={iPad}
              alt="The HR Clouds dashboard shown on a tablet"
              width={6172}
              height={4264}
              className="block w-full h-auto"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default Dashboard;
