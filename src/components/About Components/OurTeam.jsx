import React, { useState } from "react";
import { FaLinkedin, FaEnvelope } from "react-icons/fa";
import AnimateOnScroll from "../UI/AnimateOnScroll";

const OurTeam = () => {
  const teamData = [
    {
      name: "Rohit Chouhan",
      role: "Director & Founder",
      image: "https://i.ibb.co/RG6v304Z/Rohit-Chouhan-Director-Founder-1.jpg",
      description: "Leads vision and strategy with over 15 years in HR tech.",
      about:
        "Rohit has been at the forefront of business transformation initiatives, excelling in strategic planning, implementation, and execution. With a proven track record of developing innovative strategies to address and overcome complex business challenges prevalent in the industry.",
      linkedin: "https://linkedin.com/in/rohitchouhan",
      email: "rohit@hrclouds.in",
    },
    {
      name: "Ananya Sharma",
      role: "Chief Executive Officer",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&auto=format&fit=crop",
      description: "Spearheads enterprise expansion across India & global markets.",
      about:
        "Ananya has led multiple HR tech companies through successful scale-ups and is passionate about AI-driven HR systems and digital workplace transformations.",
      linkedin: "https://linkedin.com/in/ananyasharma",
      email: "ananya@hrclouds.in",
    },
    {
      name: "Rajat Verma",
      role: "Chief Technology Officer",
      image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=600&auto=format&fit=crop",
      description: "Architect of our secure, automated HR & Payroll platform.",
      about:
        "Rajat built our cloud architecture from the ground up and brings over 12+ years of experience in distributed systems, compliance automation, and enterprise security.",
      linkedin: "https://linkedin.com/in/rajatverma",
      email: "rajat@hrclouds.in",
    },
    {
      name: "Priya Nair",
      role: "VP of Product & Design",
      image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=600&auto=format&fit=crop",
      description: "Obsessed with creating frictionless, intuitive employee workflows.",
      about:
        "Priya leads our UI/UX and core product roadmap, ensuring that HR Clouds feels delightful to use for both HR teams and employees every single day.",
      linkedin: "https://linkedin.com/in/priyanair",
      email: "priya@hrclouds.in",
    },
    {
      name: "Vikram Aditya",
      role: "Head of Customer Success",
      image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=600&auto=format&fit=crop",
      description: "Dedicated to 24/7 client onboarding and SLA compliance.",
      about:
        "Vikram and his support team ensure that every enterprise migration happens in under 48 hours with zero data loss or payroll disruption.",
      linkedin: "https://linkedin.com/in/vikramaditya",
      email: "vikram@hrclouds.in",
    },
    {
      name: "Siddharth Mehta",
      role: "Chief Financial Officer",
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop",
      description: "Oversees statutory compliance engines and corporate governance.",
      about:
        "Siddharth works closely with legal and tax authorities to make sure all statutory rules (PF, ESI, PT, TDS) are perfectly built into our payroll algorithms.",
      linkedin: "https://linkedin.com/in/siddharthmehta",
      email: "siddharth@hrclouds.in",
    },
  ];

  const [visibleMembers, setVisibleMembers] = useState(4);
  const [showMore, setShowMore] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  const handleViewMore = () => {
    setShowMore(!showMore);
    setVisibleMembers(showMore ? 4 : teamData.length);
  };

  const openPopup = (member) => {
    setSelectedMember(member);
  };

  const closePopup = () => {
    setSelectedMember(null);
  };

  return (
    <section id="our-team" className="py-16 sm:py-20 xl:py-28 px-4 sm:px-8 md:px-16 xl:px-24 bg-white">
      <div className="max-w-[90rem] m-auto flex flex-col gap-y-16">
        
        {/* Section Heading */}
        <AnimateOnScroll animation="slide-up">
          <h2 className="text-center font-bold text-primary-800 text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight">
            Meet Our Leadership
          </h2>
        </AnimateOnScroll>

        {/* Leaders Grid */}
        <AnimateOnScroll animation="slide-up" delay={150}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {teamData.slice(0, visibleMembers).map((member, index) => (
              <div
                key={index}
                onClick={() => openPopup(member)}
                className="group cursor-pointer relative overflow-hidden rounded-2xl bg-primary-500 px-8 pt-10 pb-12 shadow-xl hover:-translate-y-1.5 transition-all duration-300 border border-white/5"
              >
                {/* Overlapping white transparent highlights matching pricing cards exactly */}
                <div className="left-[-20%] top-0 absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />
                <div className="top-[30%] left-[30%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />

                {/* Avatar */}
                <div className="relative z-10 flex justify-center">
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-40 h-40 object-cover rounded-xl border-4 border-white/10 shadow-md mb-6 transition-all duration-300 group-hover:scale-105"
                  />
                </div>

                {/* Identity */}
                <h3 className="text-xl font-bold text-center text-white">{member.name}</h3>
                <p className="text-sm text-purple-300 font-semibold text-center mt-1 mb-3">{member.role}</p>
                <p className="text-sm text-white/70 text-center leading-relaxed">{member.description}</p>

                {/* Links */}
                <div className="relative z-10 mt-6 flex justify-center gap-4 text-white/50">
                  {member.linkedin && (
                    <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors duration-200">
                      <FaLinkedin size={20} />
                    </a>
                  )}
                  {member.email && (
                    <a href={`mailto:${member.email}`} className="hover:text-white transition-colors duration-200">
                      <FaEnvelope size={20} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AnimateOnScroll>

        {/* View More Button */}
        <div className="text-center">
          <div className="bg-gradient-to-b from-purple-500 to-purple-200 p-[2px] rounded-2xl drop-shadow-[0_0px_25px_rgba(139,92,246,0.2)] hover:drop-shadow-[0_0px_35px_rgba(139,92,246,0.35)] transition-all duration-200 inline-block">
            <button
              onClick={handleViewMore}
              className="block text-primary-500 py-3 px-8 text-center rounded-2xl hover:bg-purple-600 hover:text-white transition-all duration-200 bg-gradient-to-t bg-purple-500 from-purple-500 to-purple-200 font-bold text-sm"
            >
              {showMore ? "Show Less" : "View More"}
            </button>
          </div>
        </div>
      </div>

      {/* Popup Modal */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 bg-primary-500/80 backdrop-blur-md flex items-center justify-center px-4">
          <div className="bg-primary-500 border border-white/10 text-white rounded-3xl p-8 max-w-xl w-full relative shadow-2xl overflow-hidden">
            {/* Modal Reflection Highlights */}
            <div className="left-[-20%] top-0 absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />
            <div className="top-[30%] left-[30%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />

            <button
              onClick={closePopup}
              className="absolute top-4 right-4 text-white text-2xl font-bold hover:text-purple-300 transition-colors z-20"
            >
              &times;
            </button>

            <div className="text-center relative z-10">
              <img
                src={selectedMember.image}
                alt={selectedMember.name}
                className="w-28 h-28 mx-auto mb-6 rounded-lg border-4 border-white/10"
              />
              <h3 className="text-2xl font-bold text-white">{selectedMember.name}</h3>
              <p className="text-sm text-purple-300 font-semibold mb-4">{selectedMember.role}</p>
              <p className="text-sm text-white/70 leading-relaxed text-justify">{selectedMember.about}</p>

              <div className="mt-6 flex justify-center gap-6 text-white/60">
                <a href={selectedMember.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  <FaLinkedin size={22} />
                </a>
                <a href={`mailto:${selectedMember.email}`} className="hover:text-white transition-colors">
                  <FaEnvelope size={22} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default OurTeam;
