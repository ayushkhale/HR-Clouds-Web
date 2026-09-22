import ProductPreview from "../ProductPreview";
import { Reveal, useParallax } from "../../../shared/motion";

/* The hero product shot. This used to be iPad.png — an AI-generated image
   branded "HrClouds" showing a recruitment dashboard (Jobs, Candidates, Career
   Site) for a module this product does not have, with "Shotlisted Candidates"
   and "Cadidates" misspelled on the face of it. It now renders the real thing.

   Motion: the frame settles forward as it enters, then drifts slowly against
   the scroll. Parallax and the entrance transform live on separate nodes so
   neither overwrites the other. */
function Dashboard() {
  const parallax = useParallax(30);

  return (
    <section className="relative z-0">
      <div className="bottom-0 -z-10 absolute bg-primary-500 w-full h-1/2" />
      <div className="justify-items-center grid m-auto px-4 sm:px-8 md:px-16 xl:px-24 py-8 md:py-16 max-w-[90rem]">
        <Reveal variant="scale" duration={900} className="w-full max-w-5xl">
          <figure
            ref={parallax}
            style={{ transform: "translate3d(0, var(--parallax-y, 0px), 0)" }}
          >
            <ProductPreview variant="dashboard" framed />
            <figcaption className="sr-only">
              The HR Clouds dashboard, showing headcount, today&rsquo;s attendance,
              a daily present, on-leave and absent breakdown, and pending approvals.
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

export default Dashboard;
