'use client';

/**
 * 自定义确认对话框组件
 */

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, type = 'warning' }) {
  if (!isOpen) return null;

  const typeStyles = {
    warning: {
      icon: '⚠️',
      bgColor: 'rgba(255, 152, 0, 0.1)',
      borderColor: 'rgba(255, 152, 0, 0.3)',
      confirmBtnBg: '#ff9800',
      confirmBtnHover: '#f57c00'
    },
    danger: {
      icon: '🗑️',
      bgColor: 'rgba(244, 67, 54, 0.1)',
      borderColor: 'rgba(244, 67, 54, 0.3)',
      confirmBtnBg: '#f44336',
      confirmBtnHover: '#d32f2f'
    },
    info: {
      icon: 'ℹ️',
      bgColor: 'rgba(33, 150, 243, 0.1)',
      borderColor: 'rgba(33, 150, 243, 0.3)',
      confirmBtnBg: '#2196f3',
      confirmBtnHover: '#1976d2'
    }
  };

  const style = typeStyles[type] || typeStyles.warning;

  return (
    <div className="confirm-dialog-overlay">
      <div className="confirm-dialog">
        <div className="confirm-dialog-header">
          <span className="confirm-dialog-icon">{style.icon}</span>
          <h3 className="confirm-dialog-title">{title}</h3>
        </div>
        <div className="confirm-dialog-body">
          <p className="confirm-dialog-message">{message}</p>
        </div>
        <div className="confirm-dialog-footer">
          <button
            className="confirm-dialog-btn confirm-dialog-btn-cancel"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="confirm-dialog-btn confirm-dialog-btn-confirm"
            onClick={onConfirm}
            style={{
              backgroundColor: style.confirmBtnBg
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = style.confirmBtnHover;
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = style.confirmBtnBg;
            }}
          >
            确认
          </button>
        </div>
      </div>

      <style jsx>{`
        .confirm-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .confirm-dialog {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          max-width: 400px;
          width: 90%;
          animation: slideUp 0.3s ease-out;
          overflow: hidden;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .confirm-dialog-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .confirm-dialog-icon {
          font-size: 28px;
        }

        .confirm-dialog-title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .confirm-dialog-body {
          padding: 20px 24px;
        }

        .confirm-dialog-message {
          margin: 0;
          font-size: 15px;
          line-height: 1.6;
          color: var(--text-secondary);
        }

        .confirm-dialog-footer {
          display: flex;
          gap: 12px;
          padding: 16px 24px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
        }

        .confirm-dialog-btn {
          flex: 1;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .confirm-dialog-btn-cancel {
          background: var(--bg-primary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .confirm-dialog-btn-cancel:hover {
          background: var(--bg-hover);
          border-color: var(--border-hover);
        }

        .confirm-dialog-btn-confirm {
          color: white;
        }

        .confirm-dialog-btn-confirm:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .confirm-dialog-btn:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
