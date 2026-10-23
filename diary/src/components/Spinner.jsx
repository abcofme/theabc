export default function Spinner({ size = 'h-8 w-8', className = '' }) {
  return (
    <div className={`flex justify-center items-center py-10 ${className}`} role="status" aria-label="Загрузка">
      <div className={`animate-spin rounded-full border-4 border-[#F5E6D3] border-t-transparent ${size}`} />
    </div>
  );
}
