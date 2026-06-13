interface Notification {
  type: string
  message: string
  old_value?: number
  new_value?: number
  delta?: number
}

interface NotificationDisplayProps {
  notifications: Notification[]
}

export default function NotificationDisplay({ notifications }: NotificationDisplayProps) {
  if (!notifications || notifications.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification, index) => (
        <div
          key={index}
          className="rounded-xl border-l-4 border-nn-periwinkle bg-nn-periwinkle/10 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-nn-periwinkle text-white">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-nn-deep-blue">
                {notification.type === 'mascot_adjustment' && 'Mascot Health Updated'}
                {notification.type === 'brownie_adjustment' && 'Brownie Points Adjustment'}
                {notification.type === 'streak_adjustment' && 'Streak Information'}
                {notification.type === 'reminder' && 'Reminder'}
                {notification.type === 'notification' && 'Notification'}
              </p>
              <p className="mt-1 text-sm text-nn-muted">{notification.message}</p>
              {notification.type === 'mascot_adjustment' &&
                notification.old_value !== undefined &&
                notification.new_value !== undefined && (
                  <p className="mt-2 text-xs text-nn-muted">
                    Health changed from {notification.old_value} to {notification.new_value}
                  </p>
                )}
              {notification.type === 'brownie_adjustment' && notification.delta !== undefined && (
                <p className="mt-2 text-xs text-nn-muted">
                  Adjustment: {notification.delta > 0 ? '+' : ''}
                  {notification.delta} points
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
