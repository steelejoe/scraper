# SYNCING

Here is some quick notes on setting up `rclone` to sync your contents folder to a Google drive.

I setup my remote as:

```yaml
- name: books
- type: drive
- scope: drive
- root_folder_id: {folder-id-for-scraped-books}
- skip_gdocs: true
- skip_checksum_gphotos: true
```

To sync to the storage, you can use the following command:

```bash
rclone sync content/ books:
```

To sync FROM Google Drive to the local system (for reading), you can use the following command:

```bash
rclone sync books: content/
```

Note: This will make your local `content/` folder match what's in Google Drive, potentially overwriting local changes. If you want to preserve local files, use `rclone copy` instead:

```bash
rclone copy books: content/
```
