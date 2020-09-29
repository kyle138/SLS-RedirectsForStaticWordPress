# SLS-RedirectsForStaticWordPress
Serverless Lambda framework for redirecting dynamic requests to a static WordPress site. 

## Background
After hosting WordPress in LAMP for decades I switched to hosting my blog statically in S3 using the popular [WP2Static plugin](https://wp2static.com/). This has several benefits such as cost, speed, and security, but it breaks the legacy dynamic links. WordPress now offers permalinks which replaces the old dynamic **?p=123** queries with **/category/post-title/**. This works well for static hosting, but if you've been sharing the old dynamic links to your blog for years those will all be broken in S3. Unfortunately there's no one simple solution to redirect these dynamic links but with a CloudFront distribution sitting in front of your S3 bucket you can intercept these query strings and use Lambda@Edge to generate redirects to the new permalink URIs.

## Prerequisites
* This function assumes you already have WordPress set up with the wp2static installed and working.
* You should also already have an S3 bucket set up for public webhosting that wp2static is deploying your site to.
* You should already have a TLS certificate for your site setup in AWS ACM.
* This function does not work with an existing CloudFront distribution and insists on creating a new one. You will need to manually configure this CloudFront distribution to use your webhosting S3 bucket as its origin.
* Lastly you should also have a separate S3 bucket setup to host your redirects.json file. 

## Configuration
Copy resources/config.json.sample to resources/config.json, it will appear as below:
```javascript
{
  "_comments": {
    "DEFAULTDOMAIN": "The default domain to use for all redirects. Must begin with https:// and omit the trailing slash.",
    "SETTINGSS3BUCKET": "The name of the S3 bucket where your redirects.json is stored.",
    "SETTINGSS3KEY": "The key (path) to your redirects.json file.",
    "ALIASES": "Alternate Domain Names (CNAMEs) for CloudFront distribution."
  },
  "envvars": {
    "DEFAULTDOMAIN": "https://github.com/kyle138",
    "SETTINGSS3BUCKET": "settings-json-bucket",
    "SETTINGSS3KEY": "simple-redirects/wp/redirects.json"
  },
  "cloudfront": {
    "ALIASES": ["blog.example.com","blog2.example.com"]
  }
}
```
* You can ignore the "_comments" section, that's just comments.
* In the "envvars" section enter your information for the following values:
  * "DEFAULTDOMAIN": This is the domain of your blog. It must begin with https:// and omit the trailing slash.
  * "SETTINGSS3BUCKET": This is **NOT** the same S3 bucket you configured wp2static to deploy your site to. This is a separate S3 bucket housing your redirects.json file. The preset example is "settings-json-bucket" but S3 buckets must be globally unique so make up your own unique bucket name to host config files.
  * "SETTINGSS3KEY": This is the path to your redirects.json within the S3 bucket. The preset example value is "simple-redirects/wp/redirects.json".
* In the "cloudfront" section enter your infomation for the following value:
  * "ALIASES": This is an array containing the Alternate Domain Names (CNAMEs) for the CloudFront distribution.
