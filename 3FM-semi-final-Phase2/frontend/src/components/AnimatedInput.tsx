import Lottie from 'lottie-react';

interface InputWithAnimationProps {
  id: string;
  type: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  label: string;
  icon: React.ReactNode;
  focusClassName: string;
  hoverClassName: string;
  animationSrc?: string;
}

export const InputWithAnimation = ({
  id,
  type,
  required = false,
  value,
  onChange,
  placeholder,
  label,
  icon,
  focusClassName,
  hoverClassName,
  animationSrc
}: InputWithAnimationProps) => {
  return (
    <div className="transform transition-all duration-500 hover:scale-[1.02] group">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        {icon}
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          required={required}
          value={value}
          onChange={onChange}
          className={`w-full px-5 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 ${focusClassName} focus:border-transparent transition-all duration-300 ${hoverClassName} bg-gray-50 focus:bg-white pr-12`}
          placeholder={placeholder}
        />
        {animationSrc && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300">
            <Lottie
              animationData={animationSrc}
              loop={true}
              autoplay={true}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Specific input animations
export const EmailInputAnimation = 'https://assets1.lottiefiles.com/packages/lf20_TiUaFl.json';
export const PasswordInputAnimation = 'https://assets6.lottiefiles.com/packages/lf20_kxsd2loq.json';
export const UserInputAnimation = 'https://assets3.lottiefiles.com/packages/lf20_8oNfDs.json';