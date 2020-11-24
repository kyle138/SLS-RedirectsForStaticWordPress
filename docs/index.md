![Diagram](https://kyle138.github.io/SLS-RedirectsForStaticWordPress/RedirectsForStaticWordPress-diagram.jpg)

Everyone turns an old Pentium III desktop into a webserver just for fun right? In early 2007 I upgraded my computer and had to find something for my old one to do so I ended up installing CentOS and started hosting a WordPress [blog](https://nighthawk.kylemunz.com). I ran that webserver in my house for over 6+ years until I eventually moved it into an AWS EC2 instance. After another 6+ years I decided to move it again, this time to S3 using the popular [WP2Static](https://wp2static.com/) plugin.

Moving the blog to a static hosting solution has several benefits such as cost, speed, and security, but it breaks search, comments, and the legacy dynamic links. I fixed search by adding a Google search widget and replaced comments with a [serverless feedback form](https://github.com/kyle138/feedbackform), so that only left the broken links to redirect. 

WordPress now offers permalinks which replaces the old dynamic **?p=123** queries with **/category/post-title/**. This works well for static hosting, but if you've been sharing the old dynamic links to your blog for years those will all be broken in S3. WP2Static doesn't offer a simple solution to redirect these dynamic links but with a CloudFront distribution sitting in front of your S3 bucket you can intercept these query strings and use Lambda@Edge to generate redirects to the new permalink URIs.

A couple of the old dynamic links have a discernible pattern so the redirect can be logically generated. For instance URLs requesting **?m=201701** follow the yyyymm pattern and can be redirected to **/date/2017/01**. Also requests for **?paged=2** can be redirected to **/page/2/**.

However, the **?p=1**, **?page_id=1**, **?attachment_id**, **?author=1**, and **?cat=1** queries have no pattern and will need to be stored in a JSON file that the Lambda@Edge function can look up by ID. WordPress stores all of the permalinks for p, page_id, and attachment_id in the **'posts'** table of the database where the ID field matches the numeric value in the **?p=123** query and the **post_name** is the new permalink URI. There's also the **'users'** table which holds the redirect values for any **?author=123** queries. Lastly the **'terms'** table holds the values for any **?cat=123** queries. An example of the redirects.json file is  in resources/redirects.json.sample and shown below:
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

I store the redirects.json file in a separate S3 bucket. Not the same bucket that's hosting my static website because I don't necessarily want this file publicly available. Any requests to '/' with a querystring trigger the lambda which loads the redirects.json, looks up the ID, and returns the new permalink URI as a 301 redirect. CloudFront retrieves all other URIs directly from S3. The great news here is CloudFront caches these redirects for some time so future requests don't need to be looked up. Also the redirects.json file is assigned outside of the event handler so subsequent redirects are returned immediately as long as the Lambda container remains warm.

So how much money is saved by hosting statically? Admitedly running a single micro EC2 instance isn't exactly expensive, it's only around $20 a month, but this new setup is essentially free. I'm hosting the source WordPress blog locally. Whenever I need to post an update to my blog (this is an admittedly rare occasion) I spin up my local LAMP environment, create or edit a post, then use the WP2Static plugin to generate the static files and deploy them to S3. The initial full deploy can take a while but subsequent updates actually deploy pretty quickly. The plugin will even create an invalidation to clear the CloudFront cache after each deployment making your updates immediately available. This has been a long time coming and overall I'm happy with my new hosting solution. I'm just curious what I'll switch to in another 6 years.

Read more about the components and configuration in the repo: [SLS-RedirectsForStaticWordPress](https://github.com/kyle138/SLS-RedirectsForStaticWordPress).
