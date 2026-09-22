import ProductPreview from "../ProductPreview";

/* The hero product shot. This used to be iPad.png — an AI-generated image
   branded "HrClouds" showing a recruitment dashboard (Jobs, Candidates, Career
   Site) for a module this product does not have, with "Shotlisted Candidates"
   and "Cadidates" misspelled on the face of it. It now renders the real thing. */
function Dashboard() {
  return (
    <section className="relative z-0">
      <div className="bottom-0 -z-10 absolute bg-primary-500 w-full h-1/2" />
      <div className="justify-items-center grid m-auto px-4 sm:px-8 md:px-16 xl:px-24 py-8 md:py-16 max-w-[90rem]">
        <figure className="w-full max-w-5xl">
          <ProductPreview variant="dashboard" framed />
          <figcaption className="sr-only">
            The HR Clouds dashboard, showing headcount, today&rsquo;s attendance,
            a daily present, on-leave and absent breakdown, and pending approvals.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export default Dashboard;
