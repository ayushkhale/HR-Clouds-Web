import iPad from "../../assets/iPad.png";

function Dashboard() {
  return (
    <section className="relative">
      <div className="bottom-0 -z-10 absolute bg-primary-500 w-full h-1/2" />
      <div className="justify-items-center grid m-auto px-4 sm:px-8 md:px-16 xl:px-24 py-8 md:py-16 max-w-[90rem]">
        <img src={iPad} alt="Dashboard" className="block w-full" />
      </div>
    </section>
  );
}

export default Dashboard;
