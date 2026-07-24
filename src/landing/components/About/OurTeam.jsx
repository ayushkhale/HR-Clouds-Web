import React, { useState } from "react";
import { FaLinkedin, FaEnvelope } from "react-icons/fa";
import AnimateOnScroll from "../../../shared/components/AnimateOnScroll";

const OurTeam = () => {
  const teamData = [
    {
      name: "Rohit Chouhan",
      role: "Founder & Partner",
      image: "https://i.ibb.co/RG6v304Z/Rohit-Chouhan-Director-Founder-1.jpg",
      description:
        "Leads overall vision, innovation, client engagement, and strategic growth initiatives.",
      about:
        "Mr. Rohit Chouhan is the visionary Founder and Partner of the organization with extensive experience in Information Technology, Digital Transformation, Project Management, Enterprise Solutions, and Business Strategy. He leads the company's overall vision, innovation, client engagement, and strategic growth initiatives. Under his leadership, the company focuses on delivering high-quality IT solutions, software development, manpower solutions, and digital services that help organizations improve operational efficiency and accelerate business growth.",
      linkedin: "https://linkedin.com/in/rohit-chouhan",
      email: "rohit@hrvistallp.com",
    },
    {
      name: "Sarla Chandoriya",
      role: "Partner & Co-Founder",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&auto=format&fit=crop",
      description:
        "Key role in business operations, administration, finance management, and organizational development.",
      about:
        "Mrs. Sarla Chandoriya serves as Partner & Co-Founder and plays a key role in business operations, administration, finance management, and organizational development. She ensures smooth operational execution while maintaining quality standards, client satisfaction, and effective coordination across various projects. Her leadership contributes significantly to building a strong, client-centric, and process-driven organization.",
      linkedin: "https://linkedin.com/in/sarla-chandoriya",
      email: "sarla@hrvistallp.com",
    },
    {
      name: "Neelima Baraskar",
      role: "Partner & Co-Founder",
      image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=600&auto=format&fit=crop",
      description:
        "Responsible for business development, client relationship management, and strategic partnerships.",
      about:
        "Mrs. Neelima Baraskar is the Partner & Co-Founder, responsible for business development, client relationship management, project coordination, and strategic partnerships. She actively supports organizational expansion by strengthening client engagement, identifying new business opportunities, and ensuring successful project delivery through collaborative leadership.",
      linkedin: "https://linkedin.com/in/neelima-baraskar",
      email: "neelima@hrvistallp.com",
    },
  ];

  const [visibleMembers, setVisibleMembers] = useState(3);
  const [showMore, setShowMore] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  const handleViewMore = () => {
    setShowMore(!showMore);
    setVisibleMembers(showMore ? 3 : teamData.length);
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
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="font-bold text-primary-800 text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight mb-4">
              A Founding Team with Domain Expertise
            </h2>
            <p className="text-gray-600 text-base sm:text-lg md:text-xl font-normal leading-relaxed">
              Hands-on exposure to HR operations, IT project execution, MIS systems, and government-aligned workflows.
            </p>
          </div>
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

        {/* View More Button (Shown only if more than 3 members) */}
        {teamData.length > 3 && (
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
        )}
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
