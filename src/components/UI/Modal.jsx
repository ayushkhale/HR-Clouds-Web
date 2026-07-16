import { useEffect } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { UseModalContext } from "../../contexts/ModalContext";

function Modal({ children, modalName }) {
  const { currentModal, setCurrentModal } = UseModalContext();

  const displayModal = modalName === currentModal;

  const handleCloseModal = () => setCurrentModal("");
  const handleModalEscape = (e) => e.key === "Escape" && handleCloseModal();

  useEffect(() => {
    displayModal && document.addEventListener("keydown", handleModalEscape);
    return () => document.removeEventListener("keydown", handleModalEscape);
  }, [displayModal]);

  return (
    <div
      className={`fixed px-4 sm:px-16 md:px-24 top-0 left-0 right-0 bottom-0 transition-all duration-300
         bg-primary-800  z-10 flex items-center justify-center
         ${displayModal ? "visible bg-opacity-70" : "invisible bg-opacity-0"}`}
      onClick={(e) => e.target === e.currentTarget && handleCloseModal()}
    >
      <div
        className={`${displayModal ? "visible opacity-100" : "invisible opacity-0"}
        relative flex bg-white rounded-2xl text-2xl flex-col transition-all
        duration-300 basis-[41.25rem]`}
      >
        <HiOutlineXMark
          className="-top-14 sm:-top-12 -right-2 sm:-right-12 absolute hover:opacity-70 w-12 h-12 transition-all duration-100 cursor-pointer stroke-white"
          onClick={handleCloseModal}
        />
        {children}
      </div>
    </div>
  );
}

export default Modal;
