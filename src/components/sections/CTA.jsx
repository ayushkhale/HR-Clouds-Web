import { UseModalContext } from "../../contexts/ModalContext";

function CTA() {
  const { setCurrentModal } = UseModalContext();

  return (
    <section className="m-auto px-4 sm:px-8 md:px-16 xl:px-24 py-16 max-w-[90rem]">
      <div className="relative flex flex-col items-center bg-primary-500 px-8 py-16 sm:py-24 lg:py-28 rounded-2xl overflow-hidden">
        <div className="top-0 absolute bg-purple-500 w-1/5 h-2" />
        <div className="lg:left-[4%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[50rem] h-28 -rotate-45" />
        <div className="lg:visible lg:left-[35%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[40rem] h-28 invisible -rotate-45" />

        <h3 className="mb-4 font-bold text-[2rem]/[2.5rem] text-center text-white sm:text-4xl md:text-5xl/[4rem] xl:text-[3.5rem]/[4rem] tracking-tight">
          Engage without limits
        </h3>
        <p className="pb-10 text-center text-white xl:text-lg tracking-tight">
          Join a growing community and talk directly with your favorite creators
        </p>
        <div className="z-10 bg-gradient-to-b from-purple-500 to-purple-200 p-[.125rem] rounded-[1.125rem]">
          <button
            onClick={() => setCurrentModal("more-information")}
            className="bg-gradient-to-t from-purple-500 to-purple-200 hover:drop-shadow-[0_0px_35px_rgba(255,184,76,0.2)] px-8 py-4 rounded-2xl font-medium text-primary-500 hover:text-white tracking-tight transition-all duration-200"
          >
            More information
          </button>
        </div>
      </div>
    </section>
  );
}

export default CTA;
