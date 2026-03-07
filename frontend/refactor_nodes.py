import re

with open('src/pages/NodesPage.tsx', 'r') as f:
    content = f.read()

# Remove the YAML/Shell drawer JSX section
drawer_start = content.find('\n      {/* YAML / Shell drawer */}')
detail_panel = content.find('\n\n      {/* Detail panel */')

print(f'Drawer start: {drawer_start}, Detail panel: {detail_panel}')

if drawer_start != -1 and detail_panel != -1:
    content = content[:drawer_start] + content[detail_panel:]
    print('Drawer section removed')

# Remove handleStartDrawerResize
resize_start = content.find('\n  const handleStartDrawerResize')
cordon_start = content.find('\n  const handleCordonToggle')
if resize_start != -1 and cordon_start != -1 and cordon_start > resize_start:
    content = content[:resize_start] + content[cordon_start:]
    print('handleStartDrawerResize removed')
else:
    print(f'Could not find resize handler: resize={resize_start}, cordon={cordon_start}')

with open('src/pages/NodesPage.tsx', 'w') as f:
    f.write(content)
print('Done')
