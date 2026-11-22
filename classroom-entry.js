(() => {
  const entry = document.getElementById('classroomEntry');
  const badge = document.getElementById('profileRoleBadge');
  if (!entry || !badge) return;
  function render() {
    const shown = !badge.hidden && badge.dataset.master === 'true';
    for (const link of [entry,document.getElementById('theoryUploadEntry')].filter(Boolean)) {
      link.hidden = !shown;link.style.display = shown ? 'inline-flex' : 'none';
    }
  }
  new MutationObserver(render).observe(badge,{attributes:true,attributeFilter:['hidden','data-master']});
  render();
})();
