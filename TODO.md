# TODO for scraper

Some thoughts about where to go next. Some of these are definites, others are possibles.

- [x] Add a TOC page when scraping
- [x] Capture all errors when scraping and report when stopping
- [x] Fix handling of multiple parts
- [x] Implement "end of chapters" detection - this looks pretty good?
- [!] Add support for Cloudflare protected sites
- [x] Add text vs image tags to book records and site records
- [x] Add image site support
- [x] Add support for taking in a list of book URLs and creating books
- [x] Make the `root-path` parameter optional based on the book URL
- [u] Add an option for pushing content to a remote storage site
- [ ] Add a `scrape-all` command to try and scrape all books
- [ ] Add completed book flag to avoid rescraping with `scrape-all` command
- [ ] Add CLI option to mark a book complete
- [ ] Support optional book cover images
- [ ] Add option for scraping single page
- [ ] Add option for flushing all pages from a book (for debugging plugins)
- [ ] Optimize gap detection - e.g. look at chapter pattern and see if there are any gaps
- [ ] Add option to scrape all known books i.e. grab the latest chapters from each book
- [ ] Implement login support
- [ ] Think about any othe types that might be needed
- [ ] Figure out how to handle books that span sites - i.e. chapters 1001-1005 are on one site, but 1006-1010 are on another
- [ ] Think about providing a UI for this tool i.e. web page based
  - This might impact what the CLI looks like i.e. make it more modular
- [ ]
