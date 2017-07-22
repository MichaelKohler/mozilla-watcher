'use strict';

const debug = require('debug')('GitHub');
const fetch = require('node-fetch');

class GitHubHelper {
  constructor(orgNames, authentication) {
    this.repos = [];
    this.authentication = authentication;
    this.orgUrl = 'https://api.github.com/orgs';
    this.orgNames = orgNames;
  }

  /**
   * Initializes a query for all requested GitHub repositories.
   *
   * @param  {String} lastCheckDate last check date to compare against
   * @return {Promise}              Promise which resolves with all repositories found
   */
  getAll(lastCheckDate) {
    this.lastCheckDate = lastCheckDate;

    const queue = [];

    this.orgNames.forEach((orgName) => {
      const promise = this.getNewRepos(orgName).catch((err) => debug(err));
      queue.push(promise);
    });

    return Promise.all(queue).then(() => { return this.repos; });
  }

  /**
   * Queries the GitHub API to get all repositories of a given organization since
   * a given date. We need to traverse since there might be more than 100 repositories..
   *
   * @param  {String} orgName       organization name to query
   * @return {Promise}              Promise which resolves with all repositories found
   */
  getNewRepos(orgName) {
    debug(`start getting repos for ${orgName}`);

    this.latestRunDate = new Date();

    return new Promise((resolve, reject) => {
      // TODO: is there a better way to do this than passing resolve and reject?
      this.fetchPagesRecursively(1, orgName, resolve, reject);
    });
  }

  /**
   * Fetches GitHub repositories for a given org recursively
   *
   * @param  {Integer}  page          page number of the current iteration
   * @param  {String}   orgName       organizaton name to fetch repositories from
   * @param  {Function} resolve      Promise resolve function
   * @param  {Function} reject       Promise reject function
   */
  fetchPagesRecursively(page, orgName, resolve, reject) {
    debug(`getting page ${page} for ${orgName}`);

    const params = `per_page=100&page=${page}&sort=created`;
    const fullUrl = `${this.orgUrl}/${orgName}/repos?${params}`;
    const options = {
      headers: {
        'User-Agent': 'MichaelKohler/mozilla-github-watcher',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': 'token ' + this.authentication.token
      }
    };

    fetch(fullUrl, options).then((res) => {
      return res.json();
    }).then((repositories) => {
      if (!repositories || repositories.message && repositories.documentation_url) {
        return reject(new Error(`we did not get a flat array back for ${orgName} on page ${page}!`))
      }

      debug(`got ${repositories.length} repositories for ${orgName}`);

      let newRepositories = repositories.filter((repo) => {
        if (!this.lastCheckDate) {
          return true;
        }

        let creationDate = new Date(repo.created_at);
        let lastCheckDate = new Date(this.lastCheckDate);

        return creationDate > lastCheckDate;
      });

      this.repos = this.repos.concat(newRepositories);

      if (repositories && repositories.length === 100 && newRepositories.length === repositories.length) {
        debug(`we need to get more for ${orgName}!`);
        this.fetchPagesRecursively(++page, orgName, resolve, reject);
      } else {
        resolve();
      }
    }).catch((err) => {
      reject(err);
    });
  }

  /**
   * Returns the last scan date
   *
   * @return {Date} date of the last scan
   */
  getLatestRunStartDate() {
    return this.latestRunDate;
  }
}

module.exports = GitHubHelper;