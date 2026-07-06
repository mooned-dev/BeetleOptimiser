// RAG knowledge base for the "Ask a Question" feature (Phase 5a).
// Each article is a self-contained answer to a common PC-performance
// question. Written to be embedding-friendly: one clear topic per article,
// plain language, no filler. Feed this array into whatever chunking/
// embedding pipeline gets built (Workers AI + Vectorize, or otherwise) -
// the shape matches the /articles/{slug} Firestore schema (title, body,
// category, tags, updatedAt gets set at seed time).

export const RAG_ARTICLES = [
  // ---------- STARTUP ----------
  {
    slug: 'why-is-my-pc-slow-to-start',
    title: 'Why is my PC slow to start up?',
    category: 'startup',
    tags: ['startup', 'boot time', 'slow'],
    body: `Slow startup is almost always caused by too many programs launching automatically at sign-in. Each one competes for CPU, disk, and network access during the first minute after boot, which is exactly when your disk is already busiest loading Windows itself. Open Task Manager's Startup tab (or this app's Startup Apps list) and check the "Startup impact" column - anything marked High that you don't use daily is a good candidate to disable. Cloud sync clients, chat apps, and printer utilities are common offenders. Disabling an item doesn't uninstall it or stop you from launching it manually later; it just stops the automatic launch. A clean Windows 11 install with only OS-provided startup items typically reaches a usable desktop in well under 20 seconds on an SSD; each additional heavy startup app can add several seconds. If startup is still slow after trimming the list, check whether you're on an HDD instead of an SSD - that's usually a bigger factor than any single app.`,
  },
  {
    slug: 'safe-to-disable-startup-programs',
    title: 'Is it safe to disable startup programs?',
    category: 'startup',
    tags: ['startup', 'safety', 'disable'],
    body: `Yes, for the vast majority of consumer software. Disabling a startup entry only stops it from launching automatically when you sign in - it does not uninstall the program, delete any files, or break anything already installed. You can always re-enable an entry the same way you disabled it. The few exceptions worth knowing: antivirus/security software should generally stay enabled at startup so it's protecting you from the moment you log in, and anything explicitly required by your employer's IT policy shouldn't be touched without asking them first. Everything else - game launchers, chat apps, cloud storage sync, printer software, PDF helper utilities - is safe to disable if you don't need it running the instant you log in. If you're unsure what an entry is, look up the process name before disabling it rather than guessing.`,
  },
  {
    slug: 'what-is-fast-startup',
    title: 'What is Windows Fast Startup and should I use it?',
    category: 'startup',
    tags: ['startup', 'fast startup', 'hibernation'],
    body: `Fast Startup is a Windows feature that hibernates the kernel session instead of fully shutting it down when you "shut down" your PC, then resumes from that saved state on the next boot - similar to how hibernate works for your whole session, but only for the kernel. It genuinely speeds up boot time on most systems, especially HDD-based ones. The tradeoffs: it can interfere with dual-boot setups (the other OS may see a stale filesystem state), and on rare occasions it can mask driver or update issues that a true full shutdown would have cleared. If you're troubleshooting an issue and want to rule out Fast Startup as a factor, do a real restart instead of shutdown, or disable it temporarily via Control Panel > Power Options > Choose what the power buttons do. For most people in normal daily use, leaving it enabled is fine and worth the faster boot.`,
  },
  {
    slug: 'startup-folder-vs-registry-run-keys',
    title: 'What\'s the difference between the Startup folder and registry Run keys?',
    category: 'startup',
    tags: ['startup', 'registry', 'run keys'],
    body: `Windows has more than one place software can register itself to launch automatically, which is why a program can sometimes reappear at startup even after you thought you removed it. The Startup folder (accessible by typing shell:startup in the Run dialog) contains shortcuts - deleting or moving a shortcut there is enough to stop that item. Separately, the registry has Run and RunOnce keys under both HKEY_CURRENT_USER (per-user, no admin needed) and HKEY_LOCAL_MACHINE (all users, needs admin rights to change). RunOnce entries are self-deleting - they run once and remove themselves, so they're rarely worth touching manually. An app can register itself in more than one of these locations, so if you disabled it in one place and it's still launching, check the others. A good startup-management tool checks all of these locations at once so you don't have to hunt through each manually.`,
  },
  {
    slug: 'startup-impact-high-medium-low',
    title: 'What do "High", "Medium", and "Low" startup impact actually mean?',
    category: 'startup',
    tags: ['startup', 'impact', 'task manager'],
    body: `Windows measures startup impact by tracking how much CPU time and disk activity an application actually uses during the boot window, not by how big the program is or how much memory it eventually uses once running. An app rated "High" is one that's actively doing work - reading files, initializing services, phoning home to check for updates - in the seconds right after you sign in. A "Low" impact app might still launch at startup, but it does so quickly and then goes idle. This is why disabling one High-impact item can shave more time off your boot than disabling five Low-impact ones. The rating can also change over time as an app updates itself, so it's worth rechecking occasionally rather than assuming a program you disabled years ago still behaves the same way today.`,
  },
  {
    slug: 'new-program-keeps-adding-itself-to-startup',
    title: 'A program keeps re-adding itself to startup after I disable it. What do I do?',
    category: 'startup',
    tags: ['startup', 'troubleshooting', 'reinstall'],
    body: `Some applications - particularly ones with a background updater or licensing check - re-register their startup entry on their own update cycle, effectively undoing a manual disable. If disabling an entry doesn't stick, check the app's own settings first; most well-behaved software has a "launch at startup" toggle in its preferences that's more reliable than fighting it through Windows' startup manager, because the app itself won't fight its own setting. If there's no in-app option, check whether the program installed a scheduled task rather than a simple Run key entry - Task Scheduler is a separate mechanism some installers use specifically because it's more persistent and harder for cleanup tools to catch. As a last resort for stubborn cases, a full uninstall and clean reinstall usually resets whatever mechanism it's using to re-add itself.`,
  },

  // ---------- RAM / MEMORY ----------
  {
    slug: 'what-does-trimming-working-sets-do',
    title: 'What does "trim working sets" / RAM optimization actually do?',
    category: 'memory',
    tags: ['ram', 'memory', 'working set'],
    body: `Every running process keeps a "working set" - the pages of memory it has touched recently and that Windows keeps readily available for it. Over time, especially after closing a heavy application, a lot of that memory can sit reserved but unused. Trimming working sets asks Windows to release those unused pages back to the standby list, where they're still cached (so nothing is lost) but available for other processes to claim faster. This is different from clearing a cache or freeing "used" memory that's actively needed - it specifically targets memory that's allocated but idle. The effect is most noticeable right after you close several large applications: without trimming, that freed-up capacity can take a while to show up as available; trimming makes it available immediately. It won't make a fundamentally memory-starved system faster, but it does reduce unnecessary memory pressure during normal use.`,
  },
  {
    slug: 'how-much-ram-is-normal-to-use',
    title: 'How much RAM usage is normal for Windows?',
    category: 'memory',
    tags: ['ram', 'memory usage', 'normal'],
    body: `It's completely normal for Windows to show 30-50% of your RAM in use even with nothing open, because Windows deliberately caches recently used files in memory to make them load faster next time (this is the "Standby" memory Task Manager shows separately from "In Use"). That cached memory isn't wasted - it gets released instantly the moment another program actually needs it. A better signal of memory pressure than the raw percentage is whether your disk activity light stays busy while you're switching between applications, which indicates Windows is paging data to disk because physical RAM is genuinely full. If you're consistently above 85-90% "In Use" (not counting Standby) during normal multitasking, more RAM or fewer simultaneously open heavy applications would help. Below that, high total usage numbers on their own aren't something to worry about.`,
  },
  {
    slug: 'why-does-chrome-use-so-much-ram',
    title: 'Why does my browser use so much RAM?',
    category: 'memory',
    tags: ['ram', 'browser', 'chrome'],
    body: `Modern browsers run each tab, and often each extension, in its own separate process for security and stability - if one tab crashes, it doesn't take the whole browser down with it. That isolation has a real memory cost, since each process needs its own copy of certain browser infrastructure rather than sharing one big pool. Ten tabs open across several sites can easily add up to a gigabyte or more, and that's before counting extensions, which each get their own overhead too. The most effective fixes are the simple ones: close tabs you're not actively using rather than leaving dozens open "just in case", disable or remove extensions you don't actually use regularly, and consider tab-suspension extensions that unload background tabs' memory while keeping them in your tab bar for a click to reload. Restarting the browser periodically also helps, since long-lived tabs can accumulate memory over many hours of use in ways that don't always get cleaned up until the process restarts.`,
  },
  {
    slug: 'do-i-need-more-ram',
    title: 'How do I know if I need to add more RAM?',
    category: 'memory',
    tags: ['ram', 'upgrade', 'hardware'],
    body: `The clearest sign is consistent, repeated slowdown specifically when switching between applications you already have open - not when launching something new, but when you alt-tab back to something you were already using and it has to reload from disk. Check Task Manager's Performance tab during your normal workload: if "Memory" is pinned near 100% and you see steady disk activity even when you're not actively saving or opening files, that's Windows paging memory contents out to disk because physical RAM ran out, and it's a strong signal more RAM would help. Also check how much RAM is actually installed versus what your motherboard/laptop supports - many systems shipped with a minimal amount that was fine years ago but is tight for current software. If you're at 8GB and regularly have a browser with many tabs plus other applications open, 16GB is a common and often inexpensive upgrade. If you're already at 16GB+ and still seeing pressure, look at what specific applications are using the most memory before assuming more RAM alone will fix it.`,
  },
  {
    slug: 'what-is-standby-memory',
    title: 'What is "Standby" memory in Task Manager and can I clear it?',
    category: 'memory',
    tags: ['ram', 'standby', 'cache'],
    body: `Standby memory is Windows' file cache - data from files you've recently opened, kept in RAM so reopening them is faster than reading from disk again. It's automatically released the instant any application requests more memory than what's currently free, so it's never actually blocking anything; it's memory doing useful work while it's idle rather than sitting empty. You generally don't need to and shouldn't try to manually clear it - "purging standby list" tools exist and do work, but doing so just means Windows has to rebuild that cache from disk the next time you open those same files, which is strictly slower than leaving it alone. The one legitimate reason to purge standby memory is benchmarking, where you want a clean, uncached baseline to measure real disk read speeds. For normal day-to-day use, a large Standby number is a sign Windows is using your RAM efficiently, not a problem to fix.`,
  },
  {
    slug: 'memory-leak-how-to-find',
    title: 'How do I find which program is causing a memory leak?',
    category: 'memory',
    tags: ['ram', 'memory leak', 'troubleshooting'],
    body: `A memory leak shows up as one process's memory usage climbing steadily over time without leveling off, even though you're not actively doing more work in it. Open Task Manager, sort the Processes tab by Memory, and note the number for your suspect application, then check back every 15-30 minutes during normal use without closing it. If the number keeps climbing rather than staying roughly flat, that's a leak. Browser tabs, chat apps left open for days, and software with active background sync are common culprits. The immediate fix is simply closing and reopening the affected application, which releases everything it was holding. The longer-term fix is checking whether an update is available - leaks are bugs, and legitimate software vendors do fix them - or reporting it if you're comfortable doing so. If a leak is severe enough to exhaust your RAM before you notice, Windows will start swapping to disk and things will slow down broadly, not just in the leaking app, which is often the first symptom people actually notice.`,
  },

  // ---------- DISK CLEANUP ----------
  {
    slug: 'whats-safe-to-delete-in-temp-folder',
    title: 'Is it safe to delete everything in the Temp folder?',
    category: 'disk-cleanup',
    tags: ['disk cleanup', 'temp files', 'safety'],
    body: `Your user Temp folder (accessed by typing %TEMP% in the Run dialog) is meant to hold short-lived files that applications create and clean up themselves - installer extraction files, temporary document copies, cache fragments. It's generally safe to delete files here, and Windows itself doesn't rely on this folder for anything persistent. The one caveat: if a program is actively running and using a temp file right now, Windows will simply refuse to delete that specific file (you'll get an "in use" error) rather than let you break something - it won't silently corrupt a running program. So the practical approach is to close as many applications as reasonably possible, delete what you can, and not worry about the handful of files that refuse to delete because they're in use. The separate Windows Temp folder (C:\\Windows\\Temp, not your user one) follows the same logic and is equally safe to clear out, again with anything actively in use simply being skipped rather than forced.`,
  },
  {
    slug: 'why-does-windows-update-leave-so-much-junk',
    title: 'Why does Windows Update leave so many files behind?',
    category: 'disk-cleanup',
    tags: ['disk cleanup', 'windows update', 'softwaredistribution'],
    body: `Every time Windows Update downloads and installs an update, it keeps the downloaded installer files in C:\\Windows\\SoftwareDistribution\\Download and often keeps a backup of replaced system files so the update can be rolled back if something goes wrong. Over months of regular Patch Tuesday updates, this can add up to several gigabytes. The download cache is always safe to clear - Windows will simply re-download anything it needs the next time it actually needs it, there's no scenario where clearing this cache breaks an already-installed update. The rollback backups (found via Disk Cleanup's "Windows Update Cleanup" option, which needs administrator rights) are slightly different: clearing them means you can no longer uninstall a previous update via the usual rollback path, though this window is time-limited anyway - Windows automatically purges old rollback data after about 10 days regardless. If you're confident an update installed cleanly and it's been more than a couple of weeks, clearing this is safe and often frees the most space of any single cleanup category.`,
  },
  {
    slug: 'do-i-need-to-empty-recycle-bin-manually',
    title: 'Does the Recycle Bin actually use disk space, and should I empty it regularly?',
    category: 'disk-cleanup',
    tags: ['disk cleanup', 'recycle bin'],
    body: `Yes - "deleting" a file in Windows normally just moves it to the Recycle Bin, where it still physically occupies the same disk space it did before, specifically so it can be restored if you change your mind. The Recycle Bin has a size limit (a percentage of the drive by default, adjustable in its Properties), and once full, the oldest items get permanently purged automatically to make room for new ones - so it does self-manage to some degree even if you never touch it. That said, if you've just deleted a large batch of files (finished a video project, cleared out downloads) and you're confident you won't want them back, emptying the bin immediately reclaims that space right away rather than waiting for automatic purging or the size cap. There's no downside to emptying it regularly as a habit, other than losing the safety net of easy recovery for whatever's in there at the time - so the only real consideration is making sure you're sure before you do it, since normal emptying is not reversible.`,
  },
  {
    slug: 'what-is-thumbnail-cache-safe-to-clear',
    title: 'What is the thumbnail cache and is it safe to clear?',
    category: 'disk-cleanup',
    tags: ['disk cleanup', 'thumbnails', 'explorer'],
    body: `Windows Explorer generates and stores small preview images (thumbnails) for photos, videos, and documents so it doesn't have to re-render a full preview every time you open a folder in thumbnail view. This cache lives in your user AppData folder and can grow to a noticeable size if you browse a lot of photo or video folders. It's completely safe to clear - it contains no original data, only generated previews, and Windows will simply regenerate thumbnails the next time you view those folders (which takes a moment the first time but is otherwise invisible). The only visible effect of clearing it is that folder thumbnails will take a brief moment to re-render the first time you open each folder again after clearing, similar to opening it for the very first time.`,
  },
  {
    slug: 'disk-cleanup-vs-third-party-cleaners',
    title: 'Is Windows\' built-in Disk Cleanup enough, or do I need a third-party tool?',
    category: 'disk-cleanup',
    tags: ['disk cleanup', 'built-in tools'],
    body: `Windows' built-in Disk Cleanup (and the newer Storage Sense feature) covers the well-known, well-understood categories: temp files, Recycle Bin, Windows Update leftovers, error reports, and a few others - all of which are safe by design because Microsoft controls exactly what they touch. Where a broader cleanup tool adds value is in going beyond those categories: browser caches across multiple browsers at once, application-specific caches that Windows' own tool doesn't know about, duplicate file detection across your whole drive, and large-file discovery to help you find what's actually consuming space. Neither approach is inherently unsafe as long as the tool sticks to well-known safe categories and, ideally, shows you what it found before deleting anything rather than deleting blind. The practical answer is that built-in cleanup is a good baseline you can run anytime with no research required, and a broader tool is worth it mainly if you want the additional categories (multi-browser cache, duplicates, large-file discovery) it covers that Windows' own tool doesn't.`,
  },
  {
    slug: 'why-is-my-disk-full-nothing-obvious',
    title: 'My disk shows almost full but I can\'t find what\'s using the space. Why?',
    category: 'disk-cleanup',
    tags: ['disk cleanup', 'disk space', 'hidden files'],
    body: `Space that's hard to find usually falls into a few categories that don't show up in a normal folder browse. System Restore points and shadow copies can silently consume many gigabytes over time and aren't visible in File Explorer at all - check via Control Panel's System Protection settings or "vssadmin list shadowstorage" (admin Command Prompt) to see how much is allocated. Hibernation file (hiberfil.sys) reserves space equal to your RAM size and sits hidden at your drive's root. Very large log files, virtual machine disk images, and Docker/WSL virtual disks are also frequently overlooked because they live in less obvious folder locations and grow silently in the background. A folder-size analysis tool that shows disk usage as a visual treemap (rather than just listing files) is the fastest way to spot these, since it makes disproportionately large folders visually obvious even when they're buried several directories deep.`,
  },

  // ---------- REGISTRY ----------
  {
    slug: 'does-registry-cleaning-actually-speed-up-pc',
    title: 'Does cleaning the registry actually speed up my PC?',
    category: 'registry',
    tags: ['registry', 'performance', 'myths'],
    body: `This is one of the most persistent myths in PC optimization, and the honest answer is: not measurably, for the vast majority of "orphan entry" cleanup that registry cleaners perform. The Windows registry is a hierarchical database, and looking up a key is a fast, indexed operation regardless of whether the registry has a thousand or a hundred thousand keys - a few thousand leftover entries from uninstalled software simply don't add meaningful lookup time. Where registry maintenance does have real, if narrow, value is fixing specific broken references - like an App Paths entry pointing at a program executable that no longer exists, which can cause a specific "file not found" error when something tries to launch via that path. That's a correctness fix for a specific symptom, not a general speed boost. Be skeptical of any tool or claim that registry cleaning will make your whole system faster; the safe, honest scope for registry maintenance is fixing specific, verifiable broken references, not blanket "cleaning" for performance.`,
  },
  {
    slug: 'is-it-risky-to-edit-the-registry',
    title: 'How risky is editing the Windows registry?',
    category: 'registry',
    tags: ['registry', 'safety', 'backup'],
    body: `Manually editing the registry (via regedit) carries real risk because the registry has no undo button and no confirmation dialogs once you're in there - deleting or changing the wrong key can prevent Windows or a specific application from starting correctly. That said, the risk is specific and avoidable, not general: as long as you only touch keys you've specifically identified (ideally from a source that shows you the exact path, not a vague "edit this generic key" instruction) and you don't delete entire hives or umbrella keys, the actual blast radius of a mistake is usually limited to one specific setting or program. Before making any manual registry change, export the specific key you're about to modify (right-click > Export) so you have an easy way back if something goes wrong - this takes seconds and turns an irreversible action into a reversible one. Automated tools that only touch a narrow, well-documented category (like orphaned App Paths entries) carry much less risk than freehand manual editing, precisely because their scope is deliberately limited.`,
  },
  {
    slug: 'what-are-app-paths-registry-entries',
    title: 'What are "App Paths" registry entries and why would they need fixing?',
    category: 'registry',
    tags: ['registry', 'app paths', 'orphan entries'],
    body: `App Paths is a registry mechanism (under HKEY_LOCAL_MACHINE and HKEY_CURRENT_USER's CurrentVersion\\App Paths key) that lets Windows find an application's executable by name alone, without needing it listed in your system PATH environment variable. Each installed app that registers here gets a key whose default value points at its .exe location. When you uninstall a program - especially an older one, or one uninstalled manually rather than through its own uninstaller - this registry entry can be left behind, now pointing at a file that no longer exists. The practical symptom is a "cannot find the file specified" error specifically when something tries to launch that program by name through this mechanism, which is a narrow but real failure mode. Fixing it means simply removing the now-broken entry; there's no way to "repair" a pointer to a file that's genuinely gone, so deletion of the stale key is the correct and complete fix, and it's specifically why this is one of the few registry cleanup categories worth doing at all.`,
  },
  {
    slug: 'should-i-back-up-registry-before-cleaning',
    title: 'Should I back up the registry before running a cleanup tool?',
    category: 'registry',
    tags: ['registry', 'backup', 'restore point'],
    body: `Yes, and the easiest way to do this isn't a manual registry export - it's creating a Windows System Restore point first (Control Panel > System > System Protection > Create). A restore point captures the whole registry state (plus some system files) and gives you a one-click way back if anything goes wrong, without needing to know which specific keys to export ahead of time. Any registry cleanup tool that respects your system should either create a restore point automatically before making changes, or clearly prompt you to create one - if a tool doesn't offer this and doesn't explain why, that's a reasonable reason to be cautious about using it. Restore points do take a small amount of disk space and Windows automatically manages how many it keeps, so creating one before a cleanup operation costs you very little for meaningful protection.`,
  },
  {
    slug: 'registry-bloat-from-uninstalled-programs',
    title: 'Do old uninstalled programs leave registry bloat behind?',
    category: 'registry',
    tags: ['registry', 'uninstall', 'leftover entries'],
    body: `Most uninstallers do a reasonably good job of removing their own registry entries, but it's common for at least some remnants to survive - an App Paths entry, a file association that was never reset back to a different handler, or a settings key the uninstaller didn't know to remove. This accumulates slowly over years of installing and removing software, but the practical impact is almost always cosmetic or narrowly functional (like the App Paths issue described elsewhere) rather than a genuine performance problem - the registry's lookup performance doesn't meaningfully degrade from having extra unused keys sitting in it. If you're chasing a specific symptom (a file type opening with the wrong program, an old program's icon or menu entry that won't go away), targeted removal of that specific leftover is worth doing. If you're just trying to speed up a system with no specific symptom, registry cleanup for its own sake is unlikely to produce a noticeable result.`,
  },

  // ---------- BROWSER ----------
  {
    slug: 'clearing-browser-cache-what-happens',
    title: 'What actually happens when I clear my browser cache?',
    category: 'browser',
    tags: ['browser', 'cache', 'cookies'],
    body: `Clearing your browser's cache removes locally stored copies of images, scripts, and other page resources that the browser saved so it wouldn't have to re-download them on your next visit to the same site. The immediate effect is that the next time you visit a site you frequent, pages will load slightly slower than usual as the browser rebuilds its cache from scratch - after that first reload, performance returns to normal. Clearing cache alone does not log you out of websites or clear saved passwords; that's controlled separately by cookies and stored credentials, which most browsers let you clear independently in the same settings panel. If you clear cookies along with cache, you will be logged out of most sites and will need to sign back in. Clearing cache is a common and often effective first troubleshooting step for a site behaving oddly (showing outdated content, broken styling) because it forces a genuinely fresh copy of everything to be downloaded.`,
  },
  {
    slug: 'too-many-browser-extensions-slow',
    title: 'Can too many browser extensions really slow things down?',
    category: 'browser',
    tags: ['browser', 'extensions', 'performance'],
    body: `Yes, and often more than people expect, because every extension runs its own background script that the browser has to load and keep running for as long as the browser is open, regardless of whether you're actively using that extension's feature at any given moment. Extensions that inject content into every page you visit (ad blockers, password manager autofill helpers, price comparison tools) have the most overhead, since their code runs on every single page load, not just when you click their icon. A practical way to check impact: open your browser's built-in task manager (in Chrome-based browsers, Shift+Esc) and look at what's using CPU or memory - extension processes are listed separately from tabs and make the cost visible per-extension rather than as one lump total. The fix is simply disabling or removing extensions you don't use regularly; you can always re-enable one later if you find you need it, so there's little downside to being aggressive about disabling anything you're not sure you still use.`,
  },
  {
    slug: 'browser-using-high-cpu-in-background',
    title: 'Why is my browser using CPU even when I\'m not actively using it?',
    category: 'browser',
    tags: ['browser', 'cpu', 'background tabs'],
    body: `Background tabs aren't fully idle by default - sites with auto-playing video, live-updating content (stock tickers, chat apps, social media feeds), or ad networks running scripts can continue consuming CPU even in a tab you're not currently looking at. Modern browsers do throttle background tabs to reduce this, but throttling isn't the same as fully pausing, and some sites are specifically designed to keep working in the background (a music or video streaming tab, for instance, needs to keep running audio even when it's not the focused tab). Browser extensions can also run scheduled background tasks unrelated to any specific tab. To find the culprit, use your browser's task manager to sort by CPU usage and identify which specific tab or extension is the actual source, rather than assuming it's the browser as a whole - closing or muting that one specific tab is usually all it takes to resolve it.`,
  },
  {
    slug: 'do-i-need-to-clear-cache-regularly',
    title: 'Should I clear my browser cache on a regular schedule?',
    category: 'browser',
    tags: ['browser', 'cache', 'maintenance'],
    body: `For most people, no - letting the cache manage itself is fine, since browsers automatically evict older cached content once the cache reaches its size limit, and the whole point of caching is that keeping frequently-visited sites' resources around makes them load faster, which is a benefit you lose every time you clear it. Clearing cache proactively makes sense in specific situations: troubleshooting a site that's showing broken or outdated content, freeing up disk space on a system that's genuinely tight on storage, or as a privacy measure if you're on a shared computer and don't want local traces of what you've browsed. Outside of those specific reasons, there's no general performance or security benefit to clearing cache on a routine schedule - it mostly just costs you the loading-speed benefit of caching without a corresponding gain.`,
  },
  {
    slug: 'multiple-browsers-installed-does-it-matter',
    title: 'Does having multiple browsers installed slow down my PC?',
    category: 'browser',
    tags: ['browser', 'multiple browsers', 'disk space'],
    body: `Simply having more than one browser installed - Chrome, Edge, Firefox, whatever else - doesn't slow your system down while they're not running; an installed-but-closed application uses disk space for its files but consumes no CPU or RAM until you actually launch it. Where multiple browsers can add up is disk space (each maintains its own separate cache, profile data, and extensions, so the total footprint across several browsers can be meaningfully larger than one) and, if you have more than one open at the same time regularly, the combined RAM and CPU usage of running two full browser engines simultaneously. If you only use one browser as your daily driver and keep a second installed just for occasional compatibility testing or a specific site, that's a reasonable setup with minimal cost. If you find yourself with several browsers you don't actually use, uninstalling the ones you don't need frees disk space, though it won't meaningfully affect performance while your main browser is running.`,
  },
  {
    slug: 'browser-history-and-performance',
    title: 'Does a huge browsing history slow the browser down?',
    category: 'browser',
    tags: ['browser', 'history', 'performance'],
    body: `Modern browsers store history in an indexed local database specifically designed to handle large volumes efficiently, so even years of accumulated history rarely causes a noticeable slowdown on its own - looking up or autocompleting from history is a fast, indexed operation regardless of whether there are a few thousand or several hundred thousand entries. Where history-related slowdown does occasionally show up is in the address bar's autocomplete/suggestion feature on lower-end hardware, or if browser sync is actively uploading a very large history to your account across devices, which is a network and sync-service load rather than a local performance issue. If you want to clear old history for privacy reasons or to reduce sync data size, that's a reasonable thing to do periodically, but don't expect it to meaningfully speed up general browsing - if your browser feels slow, extensions, open tab count, and available RAM are all far more likely explanations than history size.`,
  },

  // ---------- DRIVERS ----------
  {
    slug: 'how-often-should-i-update-drivers',
    title: 'How often should I update my drivers?',
    category: 'drivers',
    tags: ['drivers', 'updates', 'maintenance'],
    body: `There's no fixed schedule that fits everyone, but a reasonable approach is: GPU drivers are worth updating close to when a new game or major creative application you use releases, since driver updates often include specific optimizations for recent software. Chipset, network, and audio drivers change far less frequently and are worth checking every few months or when you're specifically troubleshooting an issue related to that hardware. Windows Update itself delivers driver updates automatically for most common hardware, and for many people that's sufficient - manually chasing the newest driver version for every component isn't necessary unless you're seeing a specific problem or want a specific feature/performance improvement a particular release adds. The one situation where staying current matters more is security-relevant drivers, though this is relatively rare for typical consumer hardware compared to, say, OS or browser security updates.`,
  },
  {
    slug: 'outdated-drivers-causing-crashes',
    title: 'Can outdated drivers cause crashes or blue screens?',
    category: 'drivers',
    tags: ['drivers', 'bsod', 'crashes'],
    body: `Yes - drivers run with deep access to the hardware and often the kernel itself, so a bug in a driver (outdated or otherwise) can cause a full system crash (blue screen) in situations where a bug in a normal application would just crash that one program. If you're getting blue screens, checking Reliability Monitor (search "reliability" in the Start menu) or Event Viewer's System log for the specific driver file named in the crash is the fastest way to identify a likely culprit, since Windows usually names the specific .sys driver file involved in the crash dump. GPU drivers are a particularly common source of this because they're large, complex, and updated frequently; if you're seeing crashes specifically during gaming or video playback, that's worth checking first. Updating to the latest stable driver for the component named in the crash log is the standard first fix; if a very recent driver update is what introduced the problem, rolling back to the previous version (Device Manager > right-click the device > Properties > Driver > Roll Back Driver) is the standard second option.`,
  },
  {
    slug: 'do-driver-updater-tools-work',
    title: 'Are automatic driver-updater tools reliable?',
    category: 'drivers',
    tags: ['drivers', 'tools', 'safety'],
    body: `The safest and most reliable path for driver updates is always the hardware manufacturer directly - your GPU vendor's own app (NVIDIA App, AMD Software), your laptop or motherboard manufacturer's support site, or Windows Update. Third-party driver-updater tools can be convenient for surfacing that an update exists across many components at once, but the quality and safety varies significantly between products - some pull directly from manufacturer sources and are effectively just a convenient aggregator, while lower-quality ones have been known to install generic or mismatched drivers that cause more problems than they solve. If you use a third-party tool, treat its "found an update" result as a lead to verify against the manufacturer's own site before installing, rather than trusting it to install the correct driver on its own - this is a moderate extra step, but it protects against the small but real risk of a bad driver install, which can be more disruptive to fix than the update was worth.`,
  },
  {
    slug: 'gpu-driver-clean-install-vs-update',
    title: 'What\'s the difference between updating a GPU driver and doing a clean install?',
    category: 'drivers',
    tags: ['drivers', 'gpu', 'clean install'],
    body: `A normal driver update installs the new version over your existing one, keeping your current settings, custom profiles, and configuration intact - this is the right choice for most routine updates and is faster with less risk of losing personalized settings. A clean install (available as an option in both NVIDIA's and AMD's installers) fully removes the previous driver and all its associated settings before installing the new one, which resets everything to default. This is worth doing specifically when you're troubleshooting a driver-related problem that a normal update didn't fix, since it eliminates the possibility that a corrupted leftover setting from a previous version is the actual cause. For routine "there's a new version available" updates with no specific problem to solve, a normal update is sufficient and preserves your existing configuration, which is usually what you want.`,
  },
  {
    slug: 'device-manager-yellow-warning-icon',
    title: 'What does a yellow warning icon in Device Manager mean?',
    category: 'drivers',
    tags: ['drivers', 'device manager', 'troubleshooting'],
    body: `A yellow triangle warning icon next to a device in Device Manager means Windows has detected a problem with that device's driver - most commonly, no driver is installed at all, the installed driver isn't functioning correctly, or there's a hardware conflict. Right-clicking the device and choosing Properties will show a specific error code and short description under the General tab, which is the actual starting point for diagnosing what's wrong rather than guessing. Common fixes, in order of how non-invasive they are: right-click and choose "Update driver" to let Windows search for one automatically, check the manufacturer's website for a specific driver matching your exact device model, or uninstall the device (not the hardware, just its driver entry) and let Windows redetect and reinstall it fresh on next restart. A red X or down arrow (rather than yellow triangle) typically means the device is disabled entirely, which is a separate and simpler fix - just right-click and choose Enable.`,
  },

  // ---------- WINDOWS UPDATES ----------
  {
    slug: 'why-does-windows-update-take-so-long',
    title: 'Why do Windows updates take so long to install?',
    category: 'windows-updates',
    tags: ['windows update', 'slow', 'installation'],
    body: `Large feature updates (the major version updates Windows releases roughly twice a year, versus small monthly patches) essentially install a substantial part of a new operating system version alongside your existing one, then migrate your settings and files across during the "final" restart-and-configure phase - that's why these specifically can take much longer than routine monthly updates, which are comparatively small patches to the existing system. Slower hardware compounds this: a mechanical hard drive versus an SSD can be the difference between a twenty-minute and a two-hour update, since a huge amount of file reading and writing happens during installation. It's normal for the "Working on updates" percentage screen to appear to stall at certain points (commonly around 30% and 60-70%) - these are genuinely long-running steps, not a frozen or hung installer, and interrupting the process at these points (by force-powering off) is one of the few things that can genuinely cause update-related problems, so patience during these stalls is usually the right move rather than intervention.`,
  },
  {
    slug: 'is-it-safe-to-delay-windows-updates',
    title: 'Is it safe to delay or pause Windows updates?',
    category: 'windows-updates',
    tags: ['windows update', 'pause', 'safety'],
    body: `Pausing updates for a short period (Windows allows pausing up to five weeks at a time in current versions) is generally safe and a reasonable thing to do if you're in the middle of important work and don't want an update-triggered restart at an inconvenient time. The main risk of delaying too long is missing security patches - some updates specifically fix vulnerabilities that are actively being exploited, and the longer you delay, the longer that specific window of exposure stays open. A reasonable middle ground many people use: pause during a specific busy period, but don't disable updates indefinitely, and make a habit of catching up within a few weeks rather than letting it slide for months. Feature updates (the larger, twice-yearly releases) are lower urgency to install immediately compared to monthly security patches, so if you want to be selective, prioritizing security patches while being more relaxed about feature update timing is a reasonable approach.`,
  },
  {
    slug: 'windows-update-stuck-what-to-do',
    title: 'A Windows Update seems stuck - what should I do?',
    category: 'windows-updates',
    tags: ['windows update', 'stuck', 'troubleshooting'],
    body: `Before assuming it's actually stuck, give it real time - some update phases genuinely take an hour or more on slower hardware and there's no visible progress indicator during parts of the process, which can look identical to a hang. As a rough guideline, if the percentage hasn't moved at all in over an hour AND your disk activity light shows no activity (a sign it's not doing anything at all, versus working silently), that's a reasonable point to consider it actually stuck rather than just slow. Windows has a built-in Update Troubleshooter (search "troubleshoot" in Start menu settings) that can detect and fix many common stuck-update causes automatically without needing manual intervention. If that doesn't resolve it, the next step is usually clearing the SoftwareDistribution download cache (which forces Windows to re-download the update fresh, in case the original download was corrupted) rather than force-restarting a PC mid-installation, which carries real risk of leaving the system in a broken state if it happens during certain critical phases.`,
  },
  {
    slug: 'what-is-a-cumulative-update',
    title: 'What is a "cumulative update" and why are Windows updates so large?',
    category: 'windows-updates',
    tags: ['windows update', 'cumulative', 'file size'],
    body: `Since Windows 10, Microsoft switched to a cumulative update model, meaning each monthly update contains every fix from every previous update since the last major feature release, not just what's new that month. This is why you can install just the latest update and be fully current, without needing to install months of updates in sequence - but it also means each update package is larger than it would be if it only contained that month's specific changes, since it's carrying the accumulated history along with it. The tradeoff is deliberate: it simplifies things for users (one update to install, always current) and for Microsoft (fewer support scenarios to test), at the cost of larger individual downloads. This is also why a system that's been offline for a long time can catch up with a single update rather than needing to install a long chain of monthly patches one after another.`,
  },
  {
    slug: 'do-i-need-to-restart-after-every-update',
    title: 'Do I really need to restart after every update?',
    category: 'windows-updates',
    tags: ['windows update', 'restart', 'why'],
    body: `Most Windows updates modify core system files that are actively in use while Windows is running, and Windows can't safely replace a file that's currently loaded into memory and being executed. The restart is what allows those files to be swapped out cleanly before Windows (and the programs that depend on those files) starts using the new versions - it's not an arbitrary requirement, it's how the actual file replacement gets applied safely. Some updates genuinely don't require a restart (certain definition updates for Windows Defender, for instance, apply live), which is why you don't see a restart prompt for every single update. When a restart is required and you postpone it repeatedly, the update isn't actually fully installed and active yet - it's staged and waiting - so postponing indefinitely means you're not getting the benefit (including any security fix) of an update you think you already installed.`,
  },

  // ---------- COMMON ERRORS ----------
  {
    slug: 'what-does-100-percent-disk-usage-mean',
    title: 'Task Manager shows 100% disk usage - what does that mean and how do I fix it?',
    category: 'common-errors',
    tags: ['disk usage', 'task manager', '100 percent'],
    body: `100% disk usage means your storage drive is the current bottleneck - every request being made of it is queued because it's already at maximum capacity for reads and writes, which is different from CPU or RAM being high. This is far more common and far more noticeable on mechanical hard drives than SSDs, since HDDs have dramatically lower random-access performance; if you're on an HDD and seeing sustained 100% usage during normal tasks, an SSD upgrade is usually the single most impactful fix available. On any drive type, common triggers include: a search indexing pass running in the background (normal after installing software or adding many files), an antivirus full scan, Windows Update actively installing, or a specific misbehaving application performing excessive disk activity. Sort Task Manager's Processes tab by the Disk column to identify which specific process is responsible before assuming it's a general system issue - often it's one identifiable process, not the whole system.`,
  },
  {
    slug: 'application-not-responding-what-to-do',
    title: 'A program says "Not Responding" - should I wait or force close it?',
    category: 'common-errors',
    tags: ['not responding', 'freeze', 'force close'],
    body: `"Not Responding" specifically means the application's main window isn't processing input events fast enough for Windows' liking (usually a few seconds of delay), which can mean anything from "doing genuinely heavy work and will recover in a moment" to "actually frozen and never coming back" - the label alone doesn't tell you which. A reasonable approach: if it just started showing Not Responding, give it 30-60 seconds, especially if you know it just started a heavy operation (opening a large file, running a complex calculation, saving something substantial). If it's been Not Responding for several minutes with no sign of disk or CPU activity for that specific process in Task Manager, it's very unlikely to recover on its own, and force-closing (End Task in Task Manager) is reasonable at that point. The main risk of force-closing is losing unsaved work in that specific application - if that's a concern, check whether the app has an auto-save or recovery feature before force-closing, since many modern applications can recover unsaved work on next launch.`,
  },
  {
    slug: 'blue-screen-what-first-steps',
    title: 'I got a blue screen (BSOD) - what should I check first?',
    category: 'common-errors',
    tags: ['bsod', 'blue screen', 'crash'],
    body: `The blue screen itself displays a specific stop code (like MEMORY_MANAGEMENT or KERNEL_SECURITY_CHECK_FAILURE) - noting this exact code is the single most useful piece of information for diagnosing the cause, since different codes point toward genuinely different problem categories (driver issues, memory hardware problems, disk corruption, and so on). After restarting, check Reliability Monitor or Event Viewer's System log around the time of the crash - Windows usually records which specific driver file was involved, which is often the actual culprit rather than a generic OS problem. If the crash happened shortly after installing a new driver or piece of hardware, that's the first and most likely suspect - rolling back the driver or removing the hardware to test is a reasonable next step. If blue screens are recurring rather than a one-off, and especially if the stop code varies between occurrences, that pattern can point toward failing RAM (testable with Windows Memory Diagnostic, built into Windows) rather than a software issue, since inconsistent crash types are a classic sign of a hardware problem rather than one specific buggy driver.`,
  },
  {
    slug: 'this-app-cant-run-on-your-pc-error',
    title: 'What does "This app can\'t run on your PC" mean?',
    category: 'common-errors',
    tags: ['compatibility', 'error message', '32-bit 64-bit'],
    body: `This message most commonly appears when there's an architecture mismatch - trying to run a 64-bit-only application on an older 32-bit version of Windows (rare on modern hardware, but still exists), or trying to run software built for a different processor architecture (like ARM-only software on a traditional x86/x64 PC, or vice versa). It can also appear for Windows Store apps that have specific hardware or OS version requirements your system doesn't meet, or for genuinely corrupted download/installation files where Windows detects the executable doesn't match what it expects for a valid app. The fix depends on the cause: check whether you downloaded the correct version for your system (many software downloads offer separate 32-bit/64-bit or Intel/ARM builds and it's easy to grab the wrong one), verify your Windows version meets the app's stated minimum requirements, and if you're confident you have the right version, try re-downloading the installer in case the original file was corrupted or incomplete.`,
  },
  {
    slug: 'wifi-connected-but-no-internet',
    title: 'My PC shows connected to Wi-Fi but has no internet access. Why?',
    category: 'common-errors',
    tags: ['wifi', 'network', 'no internet'],
    body: `"Connected but no internet" specifically means your PC has successfully joined the Wi-Fi network at a local level (it has a valid connection to your router) but something beyond that local connection isn't working - this is a genuinely different problem than not connecting to Wi-Fi at all, and points toward the router's actual internet connection or DNS rather than your PC's wireless hardware. First check whether other devices on the same network (phone, another computer) also have no internet - if none of them do, the problem is with your router or ISP, not your specific PC, and the fix is restarting the router/modem or contacting your ISP. If only your PC is affected while other devices work fine, try Windows' built-in network troubleshooter first (right-click the network icon in the taskbar), and if that doesn't resolve it, manually flushing DNS ("ipconfig /flushdns" in Command Prompt) or releasing and renewing your IP address ("ipconfig /release" then "ipconfig /renew") resolves a large share of these single-device cases, since a stale or corrupted local network configuration is a common specific cause.`,
  },
  {
    slug: 'program-wont-uninstall-error',
    title: 'A program won\'t uninstall and gives an error. What can I do?',
    category: 'common-errors',
    tags: ['uninstall', 'error', 'stuck program'],
    body: `Uninstaller failures are usually caused by one of a few things: the program's own uninstaller file is missing or corrupted (common if the install folder was partially deleted manually before trying to uninstall properly), the program is currently running and holding files open that the uninstaller needs to remove, or leftover registry references point at files that no longer exist in a way that confuses the uninstall process. First, make sure the program (and any of its background processes, visible in Task Manager) is fully closed before retrying. If the standard uninstaller keeps failing, check whether the software vendor provides a dedicated removal tool - larger applications, especially security software, often have one specifically because their own uninstallers can get into inconsistent states. As a last resort, a "force uninstall" feature in a management tool that directly removes the program's registry entries and files even when the original uninstaller is broken can clean up an otherwise-stuck entry, though this should be a last resort after the above steps since it bypasses whatever cleanup the vendor's own uninstaller would normally do.`,
  },

  // ---------- PERFORMANCE MYTHS ----------
  {
    slug: 'does-defragmenting-ssd-help',
    title: 'Does defragmenting an SSD improve performance?',
    category: 'performance-myths',
    tags: ['ssd', 'defrag', 'myths'],
    body: `No - and doing so is not just unhelpful but can actually reduce an SSD's lifespan slightly, since defragmentation involves large amounts of extra writing, and SSD cells have a finite number of write cycles. Traditional defragmentation exists to solve a problem specific to mechanical hard drives, where physically scattered file fragments mean the drive's read head has to move around more to read a file, which is slow. SSDs have no moving parts and near-uniform access time regardless of where data physically sits on the chip, so there's no fragmentation-related slowdown to fix in the first place. What Windows actually does for SSDs, under the same "Optimize Drives" interface that handles HDD defragmentation, is send TRIM commands - which tell the drive which blocks are no longer in use so its internal controller can manage free space more efficiently ahead of future writes. This is a legitimately useful maintenance operation for SSDs, but it's a completely different operation from defragmentation, even though Windows presents both under one "Optimize" button for simplicity.`,
  },
  {
    slug: 'does-turning-off-daily-drain-battery',
    title: 'Is it bad to leave my PC on all the time versus shutting down daily?',
    category: 'performance-myths',
    tags: ['power', 'shutdown', 'myths'],
    body: `There's no meaningful hardware wear difference either way for modern PCs - the old concern about power-cycling stressing components more than continuous operation was more relevant decades ago and isn't a significant factor for current hardware. The actual tradeoffs are more practical: leaving a PC on means it's available for scheduled maintenance tasks, background updates, and remote access whenever needed, at the cost of continuous power draw. Shutting down daily saves power and gives you a fresh boot each time, which occasionally helps if something in the running system has drifted into a degraded state (a memory leak, a stuck background process), since a restart clears all of that. Sleep mode is a reasonable middle ground for most people - low power draw like a shutdown, but near-instant resume like staying on - and is generally the recommended default for a PC you use daily but not continuously, unless you have a specific reason to want a full restart's clean slate.`,
  },
  {
    slug: 'more-startup-programs-uses-more-ram-while-running',
    title: 'If I disable a startup program, does it also stop using RAM while I\'m working?',
    category: 'performance-myths',
    tags: ['startup', 'ram', 'myths'],
    body: `Disabling an app from launching at startup only prevents it from launching automatically - it has no effect at all on that app's RAM or CPU usage while it's actually running, whether you launched it yourself or it launched automatically. These are two separate questions: "does this app launch automatically" (a startup setting) and "how much does this app use while it's running" (determined by the app's own behavior once launched, unrelated to how it was launched). If a specific application uses a lot of RAM while open regardless of how you started it, disabling its startup entry means you simply won't have that RAM usage until you manually open it - the usage itself when it's running is identical either way. This distinction matters because "disable startup apps to speed up my PC" is really about reducing what's competing for resources during the boot window specifically, not a general RAM-saving measure for whenever those apps happen to be running.`,
  },
  {
    slug: 'clearing-ram-with-a-tool-actually-helps',
    title: 'Do "RAM booster" apps that show a big number freed actually help?',
    category: 'performance-myths',
    tags: ['ram', 'ram booster', 'myths'],
    body: `Be skeptical of any tool whose main feature is a big satisfying "X MB freed!" number after clicking a button, because a large share of that freed memory is often standby/cached memory that Windows was using productively (see the Standby memory topic) rather than genuinely wasted allocation. Forcibly purging that cache doesn't create new usable capacity out of nothing - it just means Windows has to rebuild that cache from disk later, which is a net loss, not a gain. The legitimate version of this idea - trimming idle process working sets specifically, which targets memory that actually is sitting reserved-but-unused by a still-running process - is a real and modestly useful operation, but it won't produce a large dramatic number the way purging the entire standby cache does, precisely because it's targeting a smaller, more specific category of genuinely idle memory rather than everything cached. If a tool's freed-memory number seems dramatically large relative to what you'd expect from idle working sets alone, it's likely counting cache purging as part of that number, which isn't the genuine win it's presented as.`,
  },
  {
    slug: 'more-cores-always-faster',
    title: 'Does having more CPU cores always mean better performance?',
    category: 'performance-myths',
    tags: ['cpu', 'cores', 'myths'],
    body: `Not necessarily, and the honest answer depends entirely on whether the specific software you're running is written to actually use multiple cores effectively. Many everyday tasks - opening a document, browsing most websites, running most single applications - are still substantially single-threaded in their most performance-critical path, meaning one fast core matters more than many moderate ones for how snappy those specific tasks feel. Tasks that do scale well across many cores include video encoding, 3D rendering, running multiple virtual machines, and heavily multitasking many applications simultaneously - these genuinely benefit from higher core counts. For a typical mixed-use PC (browsing, documents, some multitasking, maybe light gaming), a moderate core count with strong single-core performance is generally a better real-world experience than a very high core count with weaker per-core performance, which is why CPU reviews always test a range of both single-threaded and multi-threaded workloads rather than judging by core count alone.`,
  },
  {
    slug: 'closing-background-processes-in-task-manager-helps',
    title: 'Does manually ending background processes in Task Manager actually speed things up?',
    category: 'performance-myths',
    tags: ['task manager', 'background processes', 'myths'],
    body: `It depends heavily on which process, and blindly ending things you don't recognize is more likely to cause problems (a crashed system tray feature, a broken running application) than to produce a noticeable speed improvement, because most of what shows as "Background processes" in Task Manager is genuinely idle or using negligible resources most of the time - Windows itself, security software, and system services need to run continuously for the system to function correctly, and forcibly ending them doesn't free meaningful resources; it just breaks whatever they were doing. If you've identified via Task Manager's CPU or Memory columns that one specific process is a genuine, sustained outlier - not just present in the list, but actually consuming a disproportionate share of resources over time - ending that specific process is a reasonable troubleshooting step. But treating the whole Background processes list as things to routinely clear out is not an effective performance strategy and risks breaking legitimate functionality for no real gain.`,
  },
];
