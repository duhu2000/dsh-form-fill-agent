// Optional native entry: never claims or reuses another agent's session.
window.__ModuleLoader__.load({
  id: 'dsh-form-fill-agent',
  factory(require) {
    function apply(ctx) {
      try {
        const react = require('react');
        if (typeof react?.createElement !== 'function' || typeof ctx.slots?.inject !== 'function' || typeof ctx.slots?.register !== 'function') return;
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action', id: 'form-fill-agent', order: 12,
        }, function FormFillEntry() {
          return react.createElement('a', { href: '/form-fill/', target: '_blank', rel: 'noopener noreferrer', title: 'AI填表', 'aria-label': '打开 AI填表工作台', style: { display: 'block', padding: '8px 12px', color: 'inherit', textDecoration: 'none' } }, '▦ AI填表');
        }));
      } catch {
        // Public /form-fill/ page remains available if optional Client slots differ.
      }
    }
    return { name: 'form-fill-agent', inject: [], apply };
  },
});
