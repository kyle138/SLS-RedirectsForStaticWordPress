# SLS-RedirectsForStaticWordPress
Serverless Lambda framework for redirecting dynamic requests to a static WordPress site.
![Diagram](https://kyle138.github.io/SLS-RedirectsForStaticWordPress/RedirectsForStaticWordPress-diagram.jpg)

## Background
After hosting WordPress in [LAMP](https://en.wikipedia.org/wiki/LAMP_(software_bundle)) for decades I switched to hosting my [blog](https://nighthawk.kylemunz.com/) statically in S3. This function was built to handle the old (and now broken) dynamic links to my posts. Read more about the journey at [https://kyle138.github.io/SLS-RedirectsForStaticWordPress/](https://kyle138.github.io/SLS-RedirectsForStaticWordPress/).

## Prerequisites
This function assumes the following:
* You already have WordPress set up with the wp2static installed and working.
* You should already have an S3 bucket set up for public webhosting that wp2static is deploying your site to.
* You should also already have a TLS certificate for your site setup in AWS ACM.
* This function does not work with an existing CloudFront distribution and insists on creating a new one.
* You should also have a separate S3 bucket setup to host your redirects.json file.(See sample file in resources/redirects.json.sample)
* Lastly, you should have some familiarity with using the [Serverless Application Framework](https://www.serverless.com/).

## Configuration
Copy resources/config.json.sample to resources/config.json and edit as necessary for your information. It will appear as below:
```javascript
{
  "_comments": {
    "DEFAULTDOMAIN": "The default domain to use for all redirects. Must begin with https:// and omit the trailing slash.",
    "SETTINGSS3BUCKET": "The name of the S3 bucket where your redirects.json is stored.",
    "SETTINGSS3KEY": "The key (path) to your redirects.json file.",
    "ALIASES": "Alternate Domain Names (CNAMEs) for CloudFront distribution.",
    "DOMAINNAME": "The origin for CloudFront, your S3 bucket's web endpoint.",
    "ACMCERTIFICATEARN": "The ARN for the AWS ACM certificate to use with this distribution."
  },
  "envvars": {
    "DEFAULTDOMAIN": "https://blog.example.com",
    "SETTINGSS3BUCKET": "settings-json-bucket",
    "SETTINGSS3KEY": "simple-redirects/wp/redirects.json"
  },
  "cloudfront": {
    "ALIASES": ["blog.example.com","blog2.example.com"],
    "DOMAINNAME": "blog.example.com.s3-website-us-east-1.amazonaws.com",
    "ACMCERTIFICATEARN": "arn:aws:acm:us-east-1:314159265358:certificate/identifier-string"
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
  * "DOMAINNAME": This is the Origin Domain Name for CloudFront. This will be your hosting S3 bucket's web endpoint.
  * "ACMCERTIFICATEARN": The ARN for the ACM SSL certificate to use for CLoudFront.

## Redirects
Wordpress stores all of its post, author, category, etc IDs in its 'posts', 'users', and 'terms' DB tables. You will need to query the `ID` and `post_name` for attachment, post, and cat post_types and store them in a JSON file. The file will have an array for "authors", "cats", and "posts". I have provided an example in resources/redirects.json.sample. 
```javascript
{
  "authors":
    {
      "1": {
        "redir": "author/kyle10001010"
      },
      "2": {
        "redir": "author/kyle00101011"
      }
    },
  "cats":
    {
      "1": {
        "redir": "category/1/"
      },
      "2": {
        "redir": "category/2/"
      }
    },
  "posts":
    {
      "0": {
        "redir": "/"
      },
      "1": {
        "redir": "post1/"
      },
      "2": {
        "redir": "post2/"
      }
    }
}
```
After your redirects.json file is generated it will need to be uploaded to a separate S3 bucket, **NOT** the bucket hosting your static site, and that bucket/key will need to be stored in the resources/config.json file.

## Components
- Created by this serverless framework:
  - **Lambda:** ```lambdas/simpleRedirect.handler``` Lambda@Edge function triggered by origin-requests to CloudFront.
    - Verifies that URI is '/' and querystring contains a value for p, page_id, attachment_id, cat, author, m, or paged.
    - Retrieves redirects.json from S3 and loads it outside the event handler so subsequent redirects respond faster.
    - Returns a 301 redirect or a 404.
  - **CloudFront:** CloudFront distribution that caches your S3 website
    - Path pattern '/' with a querystring triggers the Lambda@Edge redirect function.
    - Default(\*) behavior forwards the remaining requests to S3
  - **S3:** S3 bucket containing the redirects.json file.
    - This is not the same as the S3 bucket hosting your static website.
    - This bucket does not require public access and should be kept private.
- Relied on by this framework but created externally:
  - **WordPress:** The WordPress source for your blog.
    - Hosted either in a local environment or a private hosting solution.
    - Must have the WP2Static or similar plugin installed.
  - **S3:** S3 bucket hosting your static website.
    - This must be configured for public webhosting.
    - The WP2Static plugin must be configured to deploy to this bucket.

## Credits
By no means did I come up with all of this by myself. I drew heavy inspiration (and code) from the links below:
* [Lambda@Edge Example Functions at AWS Docs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html)
* [Lambda@Edge Support at Serverless.com](https://www.serverless.com/blog/lambda-at-edge-support-added)
* [List of WordPress's public variables at wpmudev](https://premium.wpmudev.org/blog/building-customized-urls-wordpress/)
* [None of this would be possible without the WP2Static plugin](https://wp2static.com/)
* [My good friend Joshua and I previously worked on a similar project](https://github.com/jroberson)
